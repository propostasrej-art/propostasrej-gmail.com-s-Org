import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import multer from "multer";
import { Readable } from "stream";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { AssinafyClient } from "@assinafy/sdk";
import fs from "fs";

const _filename = typeof __filename !== "undefined"
  ? __filename
  : (import.meta && import.meta.url ? fileURLToPath(import.meta.url) : "server.ts");
const _dirname = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(_filename);

const logDebug = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(process.cwd(), "debug_drive.log"), line);
  } catch (e) {
    console.error("Error writing to debug_drive.log:", e);
  }
};

const responseToBuffer = async (data: any): Promise<Buffer> => {
  if (!data) {
    throw new Error("Dados da resposta estão vazios");
  }
  // Se for um Stream (Readable)
  if (data.on && typeof data.on === "function") {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      data.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
      data.on("end", () => resolve(Buffer.concat(chunks)));
      data.on("error", (err: any) => reject(err));
    });
  }
  // Se já for um Buffer
  if (Buffer.isBuffer(data)) {
    return data;
  }
  // Se for ArrayBuffer ou Uint8Array
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return Buffer.from(data as any);
  }
  // Se for qualquer outra coisa (ex: string)
  return Buffer.from(String(data));
};

const getOAuth2Client = (requestHost?: string) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "703745353676-nqorfif2gmqe7pathgfpfjvos8mio1bb.apps.googleusercontent.com";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "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";
  
  let appUrl = "";
  if (requestHost && (requestHost.includes("run.app") || !requestHost.includes("localhost"))) {
    appUrl = `https://${requestHost}`;
  } else {
    appUrl = process.env.APP_URL || "https://ais-dev-mnko3fredg5cl6fz5xbf3b-366038558643.us-east1.run.app";
    if (appUrl.startsWith("http://localhost") && requestHost && !requestHost.includes("localhost")) {
      appUrl = `https://${requestHost}`;
    }
  }
  
  appUrl = appUrl.replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  console.log(`[OAuth] Inicializando cliente com Redirect URI: ${redirectUri}`);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const isGoogleAuthError = (error: any) => {
  if (!error) return false;
  
  const getMessage = (val: any) => {
    if (typeof val === 'string') return val.toLowerCase();
    if (typeof val === 'object' && val !== null) {
      try {
        return JSON.stringify(val).toLowerCase();
      } catch (e) {
        return "";
      }
    }
    return "";
  };

  const message = getMessage(error.message);
  const data = error.response?.data;
  const dataStr = getMessage(data);
  const status = error.response?.status || error.code;

  return (
    status === 401 ||
    message.includes("invalid_grant") ||
    dataStr.includes("invalid_grant") ||
    message.includes("invalid token") ||
    dataStr.includes("invalid token") ||
    message.includes("expired") ||
    dataStr.includes("expired") ||
    message.includes("unauthorized") ||
    dataStr.includes("unauthorized")
  );
};

const isApiDisabledError = (error: any) => {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  const data = error.response?.data;
  const dataStr = typeof data === 'object' ? JSON.stringify(data).toLowerCase() : String(data || "").toLowerCase();
  
  return message.includes("has not been used in project") || 
         dataStr.includes("has not been used in project") || 
         message.includes("is disabled") ||
         dataStr.includes("is disabled") ||
         message.includes("enable it by visiting") ||
         dataStr.includes("enable it by visiting");
};

const setCredentialsAndListen = (auth: any, tokens: any, res: any) => {
  auth.setCredentials(tokens);
  auth.on("tokens", (newTokens: any) => {
    console.log("[OAuth] Token auto-refreshed, saving updated credentials back to 'google_tokens' cookie.");
    const mergedTokens = { ...tokens, ...newTokens };
    res.cookie("google_tokens", JSON.stringify(mergedTokens), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  });
};

const clearGoogleTokensCookie = (res: any) => {
  res.clearCookie("google_tokens", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
  });

  // Middleware to allow iframes
  app.use((req, res, next) => {
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *;");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

  // Google Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const client = getOAuth2Client(req.headers.host);
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      prompt: "consent",
    });
    res.json({ url });
  });

  const isInsufficientPermissionError = (error: any) => {
    if (!error) return false;
    if (isApiDisabledError(error)) return false;
    const message = (error.message || "").toLowerCase();
    const data = error.response?.data;
    const dataStr = typeof data === 'object' ? JSON.stringify(data).toLowerCase() : String(data || "").toLowerCase();
    
    return error.code === 403 || 
           error.status === 403 || 
           error.response?.status === 403 ||
           message.includes("insufficient permission") || 
           dataStr.includes("insufficient permission") ||
           message.includes("insufficient scope") ||
           dataStr.includes("insufficient scope") ||
           message.includes("insufficient authentication scopes") ||
           dataStr.includes("insufficient authentication scopes");
  };

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const client = getOAuth2Client(req.headers.host);
      const { tokens } = await client.getToken(code as string);
      
      // Merge with existing cookies to stay robust and not lose refresh token
      let mergedTokens = tokens;
      const existingCookie = req.cookies.google_tokens;
      if (existingCookie) {
        try {
          const oldTokens = JSON.parse(existingCookie);
          mergedTokens = { ...oldTokens, ...tokens };
        } catch (e) {
          console.error("[OAuth Callback] Error parsing existing tokens cookie:", e);
        }
      }

      // Store tokens in a secure, cross-origin cookie
      res.cookie("google_tokens", JSON.stringify(mergedTokens), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticação concluída com sucesso! Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      if (isGoogleAuthError(error)) {
        console.warn("Google token exchange warning (code already used or expired).");
      } else {
        console.error("Error exchanging code:", error);
      }
      res.status(500).send("Erro na autenticação com o Google.");
    }
  });

  app.get("/api/auth/google/status", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.json({ isAuthenticated: false });
    }
    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);
      
      const tokenInfo = await auth.getAccessToken();
      if (!tokenInfo.token) {
        clearGoogleTokensCookie(res);
        return res.json({ isAuthenticated: false });
      }
      res.json({ isAuthenticated: true });
    } catch (error: any) {
      if (isGoogleAuthError(error)) {
        console.warn("[OAuth Status Check] Google tokens are expired or invalid (user needs to re-authenticate).");
      } else {
        console.error("[OAuth Status Check] Error verifying Google tokens:", error);
      }
      clearGoogleTokensCookie(res);
      res.json({ isAuthenticated: false });
    }
  });

  app.post("/api/auth/google/logout", (req, res) => {
    clearGoogleTokensCookie(res);
    res.json({ success: true });
  });

  app.post("/api/export/sheets", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Não autenticado com o Google", reauth: true });
    }

    const { data, title, spreadsheetId: existingSpreadsheetId } = req.body;

    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);

      const sheets = google.sheets({ version: "v4", auth });
      
      let spreadsheetId = existingSpreadsheetId;
      let sheetTitle = "Sheet1";

      if (!spreadsheetId) {
        // Create a new spreadsheet
        const spreadsheet = await sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: title || `Relatório de Extração - ${new Date().toLocaleDateString()}`,
            },
          },
        });
        spreadsheetId = spreadsheet.data.spreadsheetId;
        sheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
      } else {
        // Get existing spreadsheet metadata
        const spreadsheet = await sheets.spreadsheets.get({
          spreadsheetId,
        });
        sheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title || "Sheet1";
        
        // Clear existing data before update
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${sheetTitle}!A1:Z1000`,
        });
      }

      // Prepare data for sheets
      // Assuming data is an array of objects
      if (data && data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map((item: any) => headers.map(header => item[header]));
        const values = [headers, ...rows];

        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId!,
          range: `${sheetTitle}!A1`,
          valueInputOption: "RAW",
          requestBody: {
            values,
          },
        });
      }

      res.json({ 
        success: true, 
        spreadsheetId, 
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` 
      });
    } catch (error: any) {
      if (isGoogleAuthError(error) || isInsufficientPermissionError(error)) {
        console.warn("Google authentication error during sheets export (user needs to login again).");
        clearGoogleTokensCookie(res);
        return res.status(401).json({ 
          error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente para autorizar o acesso.",
          reauth: true 
        });
      }
      console.error("Error exporting to sheets:", error);
      if (isApiDisabledError(error)) {
        const data = error.response?.data;
        const message = data?.error?.message || error.message;
        const matchedUrl = (message.match(/https:\/\/[^\s]+/)?.[0] || "").replace(/[.,();]+$/, "");
        return res.status(403).json({ 
          error: "A API do Google Sheets não está habilitada no seu projeto do Google Cloud.",
          details: message,
          link: matchedUrl || "https://console.cloud.google.com/apis/library/sheets.googleapis.com"
        });
      }
      res.status(500).json({ error: "Erro ao exportar para o Google Sheets", details: error.message });
    }
  });

  app.post("/api/gmail/send", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ 
        error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente para autorizar o acesso.",
        reauth: true 
      });
    }

    const { to, subject, body, attachmentBase64, attachmentName, attachments, driveFolderUrl } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes: destinatário, assunto ou corpo do e-mail" });
    }

    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);

      const gmail = google.gmail({ version: "v1", auth });

      const mergedAttachments = [...(attachments || [])];

      if (driveFolderUrl) {
        try {
          const drive = google.drive({ version: "v3", auth });
          const match = driveFolderUrl.match(/\/folders\/([a-zA-Z0-9-_]+)/) || driveFolderUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
          const folderId = match ? match[1] : null;
          if (folderId) {
            logDebug(`[Gmail Send] Carregando arquivos da pasta do Drive folderId=${folderId}`);
            const filesRes = await drive.files.list({
              q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
              fields: "files(id, name, mimeType)",
            });
            const files = filesRes.data.files || [];
            logDebug(`[Gmail Send] Encontrados ${files.length} arquivos na pasta do Drive`);
            for (const file of files) {
              if (file.id && file.name) {
                logDebug(`[Gmail Send] Baixando conteúdo do arquivo do Drive: ${file.name}`);
                const fileContentRes = await drive.files.get({
                  fileId: file.id,
                  alt: "media"
                }, { responseType: "arraybuffer" });
                
                const buffer = Buffer.from(fileContentRes.data as ArrayBuffer);
                mergedAttachments.push({
                  filename: file.name,
                  content: buffer.toString("base64"),
                  contentType: file.mimeType || "application/octet-stream"
                });
              }
            }
          }
        } catch (driveErr: any) {
          console.error("[Gmail Send] Erro de download automático ao obter arquivos do Drive para o e-mail:", driveErr);
        }
      }

      let rawMessage = "";

      if ((attachmentBase64 && attachmentName) || (mergedAttachments.length > 0)) {
        const boundary = "proposta_boundary_marker_" + Date.now();
        const header = [
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "",
        ].join("\r\n");

        const bodyPart = [
          `--${boundary}`,
          'Content-Type: text/plain; charset="utf-8"',
          "Content-Transfer-Encoding: 7bit",
          "",
          body,
          "",
        ].join("\r\n");

        const parts: string[] = [header, bodyPart];

        if (attachmentBase64 && attachmentName) {
          const attachmentPart = [
            `--${boundary}`,
            `Content-Type: application/pdf; name="${attachmentName}"`,
            `Content-Disposition: attachment; filename="${attachmentName}"`,
            "Content-Transfer-Encoding: base64",
            "",
            attachmentBase64.replace(/\s/g, ""), // strip whitespaces from base64 string
            "",
          ].join("\r\n");
          parts.push(attachmentPart);
        }

        if (mergedAttachments.length > 0) {
          for (const item of mergedAttachments) {
            if (item.content && item.filename) {
              const contentType = item.contentType || "application/octet-stream";
              const attachmentPart = [
                `--${boundary}`,
                `Content-Type: ${contentType}; name="${item.filename}"`,
                `Content-Disposition: attachment; filename="${item.filename}"`,
                "Content-Transfer-Encoding: base64",
                "",
                item.content.replace(/\s/g, ""), // strip whitespaces
                "",
              ].join("\r\n");
              parts.push(attachmentPart);
            }
          }
        }

        const footer = `--${boundary}--`;
        parts.push(footer);

        const fullMessage = parts.join("\r\n");
        rawMessage = Buffer.from(fullMessage)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      } else {
        const header = [
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
          "MIME-Version: 1.0",
          'Content-Type: text/plain; charset="utf-8"',
          "Content-Transfer-Encoding: 7bit",
          "",
          body,
        ].join("\r\n");
        rawMessage = Buffer.from(header)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }

      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: rawMessage,
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      if (isGoogleAuthError(error) || isInsufficientPermissionError(error)) {
        console.warn("Google authentication error during Gmail send (user needs to login again).");
        clearGoogleTokensCookie(res);
        return res.status(401).json({ 
          error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente para autorizar o acesso.",
          reauth: true 
        });
      }
      console.error("Error sending email via Gmail:", error);
      if (isApiDisabledError(error)) {
        const data = error.response?.data;
        const message = data?.error?.message || error.message;
        const matchedUrl = (message.match(/https:\/\/[^\s]+/)?.[0] || "").replace(/[.,();]+$/, "");
        return res.status(403).json({ 
          error: "A API do Gmail não está habilitada no seu projeto do Google Cloud.",
          details: message,
          link: matchedUrl || "https://console.cloud.google.com/apis/library/gmail.googleapis.com"
        });
      }
      res.status(500).json({ error: "Erro ao enviar e-mail via Gmail", details: error.message });
    }
  });

  app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Não autenticado com o Google", reauth: true });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    const { folderName, parentFolderName = process.env.DRIVE_PARENT_FOLDER || "AppSheet_Propostas", customFileName } = req.body;

    console.log(`[Drive] Iniciando upload de arquivo: ${req.file.originalname}. Folder: ${folderName}, Parent: ${parentFolderName}`);

    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);

      const drive = google.drive({ version: "v3", auth });

      const getOrCreateFolder = async (name: string, parentId?: string) => {
        const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        let query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        
        // If searching for the top-level parent, restrict to root to avoid duplicates elsewhere
        if (!parentId) {
          query += " and 'root' in parents";
        } else {
          query += ` and '${parentId}' in parents`;
        }
        
        console.log(`[Drive] Searching for folder: "${name}" (parentId: ${parentId || 'root'})`);
        const res = await drive.files.list({
          q: query,
          fields: "files(id, name)",
          spaces: 'drive',
          pageSize: 1
        });

        if (res.data.files && res.data.files.length > 0) {
          console.log(`[Drive] Folder found: ${res.data.files[0].id}`);
          return res.data.files[0].id;
        }

        console.log(`[Drive] Folder not found, creating: "${name}"`);
        const createRes = await drive.files.create({
          requestBody: {
            name: name,
            mimeType: "application/vnd.google-apps.folder",
            parents: parentId ? [parentId] : undefined,
          },
          fields: "id",
        });
        console.log(`[Drive] Folder created: ${createRes.data.id}`);
        return createRes.data.id;
      };

      let finalParentId: string | undefined;

      // 1. Get or create the main parent folder (e.g., AppSheet_Propostas)
      if (parentFolderName) {
        finalParentId = await getOrCreateFolder(parentFolderName);
      }

      // 2. Get or create the subfolder (e.g., ID_EMPREENDIMENTO_UNIDADE_TORRE)
      if (folderName) {
        finalParentId = await getOrCreateFolder(folderName, finalParentId);
      }

      const fileMetadata: any = {
        name: customFileName ? `${customFileName} - ${req.file.originalname}` : req.file.originalname,
      };

      if (finalParentId) {
        fileMetadata.parents = [finalParentId];
      }

      const media = {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, name, webViewLink",
      });

      res.json({
        success: true,
        fileId: response.data.id,
        fileName: response.data.name,
        fileUrl: response.data.webViewLink,
        folderUrl: finalParentId ? `https://drive.google.com/drive/folders/${finalParentId}` : undefined,
      });
    } catch (error: any) {
      if (isGoogleAuthError(error) || isInsufficientPermissionError(error)) {
        console.warn("Google authentication error during Drive upload (user needs to login again).");
        clearGoogleTokensCookie(res);
        return res.status(401).json({ 
          error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente para autorizar o acesso.",
          reauth: true
        });
      }
      console.error("Error uploading to Drive:", error);
      if (isApiDisabledError(error)) {
        const data = error.response?.data;
        const message = data?.error?.message || error.message;
        const matchedUrl = (message.match(/https:\/\/[^\s]+/)?.[0] || "").replace(/[.,();]+$/, "");
        return res.status(403).json({ 
          error: "A API do Google Drive não está habilitada no seu projeto do Google Cloud.",
          details: message,
          link: matchedUrl || "https://console.cloud.google.com/apis/library/drive.googleapis.com"
        });
      }
      res.status(500).json({ error: "Erro ao fazer upload para o Google Drive", details: error.message });
    }
  });

  app.get("/api/drive/list", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Não autenticado com o Google", reauth: true });
    }

    const { folderName = "AppSheet_Propostas" } = req.query;

    try {
      const tokens = JSON.parse(tokensStr);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);
      const drive = google.drive({ version: "v3", auth });

      // Find folder ID
      const folderRes = await drive.files.list({
        q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
        pageSize: 1
      });

      let folderId = "";
      if (folderRes.data.files && folderRes.data.files.length > 0) {
        folderId = folderRes.data.files[0].id!;
      } else {
        return res.json({ files: [], folderCreated: false });
      }

      // List files in folder
      const filesRes = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, webViewLink, createdTime, thumbnailLink)",
        orderBy: "createdTime desc",
      });

      res.json({ 
        files: filesRes.data.files || [], 
        folderId,
        folderName 
      });
    } catch (error: any) {
      if (isGoogleAuthError(error) || isInsufficientPermissionError(error)) {
        console.warn("Google authentication error during Drive list (user needs to login again).");
        clearGoogleTokensCookie(res);
        return res.status(401).json({ 
          error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente.",
          reauth: true
        });
      }
      console.error("Error listing Drive files:", error);
      res.status(500).json({ error: "Erro ao listar arquivos do Drive", details: error.message });
    }
  });

  app.get("/api/drive/file/:fileId", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      logDebug("[Drive Route Error] No google_tokens cookie found");
      return res.status(401).send("Unauthorized");
    }

    const { fileId } = req.params;

    try {
      const tokens = JSON.parse(tokensStr);
      logDebug(`[Drive Route] Início de download do arquivo id=${fileId}`);
      const auth = getOAuth2Client(req.headers.host);
      setCredentialsAndListen(auth, tokens, res);
      const drive = google.drive({ version: "v3", auth });

      // Fetch metadata to get the name and exact mimeType and size
      const metadata = await drive.files.get({ fileId, fields: "mimeType, name, size" });
      const mimeType = metadata.data.mimeType || "application/octet-stream";
      const fileName = metadata.data.name || "file";
      const fileSize = metadata.data.size;

      logDebug(`[Drive Route] Meta obtida: fileName="${fileName}", mimeType="${mimeType}", fileSize=${fileSize}`);

      let fileBuffer: Buffer;
      let finalMimeType = mimeType;

      const googleWorkspaceMimeTypes = [
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.google-apps.presentation"
      ];

      if (googleWorkspaceMimeTypes.includes(mimeType)) {
        logDebug(`[Drive Route] Exportando formato Google Workspace como PDF usando stream...`);
        finalMimeType = "application/pdf";
        const exportRes = await drive.files.export(
          { fileId, mimeType: "application/pdf" },
          { responseType: "stream" }
        );
        if (!exportRes.data) {
          throw new Error("exportRes.data retornou vazio ao exportar do Drive");
        }
        fileBuffer = await responseToBuffer(exportRes.data);
      } else {
        logDebug(`[Drive Route] Baixando arquivo binário padrão usando stream...`);
        const fileRes = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "stream" }
        );
        if (!fileRes.data) {
          throw new Error("fileRes.data retornou vazio ao baixar do Drive");
        }
        fileBuffer = await responseToBuffer(fileRes.data);
      }

      logDebug(`[Drive Route] Arquivo baixado com sucesso. Buffer final: ${fileBuffer.length} bytes`);

      if (fileBuffer.length === 0) {
        throw new Error("O arquivo baixado do Google Drive está vazio (0 bytes).");
      }

      // Log the first 100 bytes is incredibly useful for diagnosing corruption
      const previewBytes = fileBuffer.slice(0, 100);
      logDebug(`[Drive Route] Primeiros 100 bytes (Hex): ${previewBytes.toString("hex")}`);
      logDebug(`[Drive Route] Primeiros 100 bytes (ASCII/UTF8, filtrando binário): ${previewBytes.toString("utf8").replace(/[^\x20-\x7E]/g, ".")}`);

      res.setHeader("Content-Type", finalMimeType);
      res.setHeader("Content-Length", fileBuffer.length);
      
      const finalFileName = googleWorkspaceMimeTypes.includes(mimeType) 
        ? (fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`)
        : fileName;
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(finalFileName)}"`);
      
      res.send(fileBuffer);
    } catch (error: any) {
      logDebug(`[Drive Route Error] Falha de download do arquivo ${fileId}: ${error.message}`);
      if (isGoogleAuthError(error) || isInsufficientPermissionError(error)) {
        console.warn(`Google authentication error fetching file content for ${fileId} (user needs to login again).`);
        clearGoogleTokensCookie(res);
        return res.status(401).json({ 
          error: "Sessão do Google expirada ou permissões insuficientes. Por favor, faça login novamente.",
          reauth: true
        });
      }
      console.error("Error fetching file content:", error);
      res.status(500).json({ error: "Erro ao buscar conteúdo do arquivo", details: error.message });
    }
  });

  app.post("/api/appsheet/add", async (req, res) => {
    const appId = process.env.APPSHEET_APP_ID;
    const accessKey = process.env.APPSHEET_ACCESS_KEY;
    const tableName = process.env.APPSHEET_TABLE_NAME || "entrada";

    console.log(`[AppSheet] Recebido pedido de adição de linha. AppId: ${appId}, Table: ${tableName}`);

    if (!appId || !accessKey) {
      console.error("[AppSheet] Configuração ausente: APPSHEET_APP_ID ou APPSHEET_ACCESS_KEY não definidos.");
      return res.status(400).json({ error: "Configuração do AppSheet ausente (App ID ou Access Key)" });
    }

    const { rows } = req.body;

    try {
      const response = await axios.post(`https://www.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action`, {
        Action: "Add",
        Properties: {
          Locale: "pt-BR",
          Timezone: "E. South America Standard Time",
        },
        Rows: rows,
      }, {
        headers: {
          "Content-Type": "application/json",
          "ApplicationAccessKey": accessKey,
        }
      });

      console.log("[AppSheet] Resposta da API:", response.data);
      res.json({ success: true, result: response.data });
    } catch (error: any) {
      console.error("Error calling AppSheet API:", error.response?.data || error.message);
      res.status(500).json({ 
        error: "Erro interno ao conectar com AppSheet", 
        details: error.response?.data || error.message 
      });
    }
  });

  app.post("/api/gemini/extract", async (req, res) => {
    try {
      const { parts, model, responseSchema } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        logDebug("[Gemini Extract Error] API Key missing in environment");
        console.error("[Gemini Server] API Key missing in environment (process.env.GEMINI_API_KEY).");
        return res.status(500).json({ 
          error: "A chave API Gemini não foi encontrada nas variáveis de ambiente do servidor. Verifique as configurações de secrets." 
        });
      }

      logDebug(`[Gemini Extract] Iniciando processamento com o modelo: ${model || "gemini-3.1-flash-lite"}, Parts count: ${parts?.length || 0}`);
      
      if (parts && Array.isArray(parts)) {
        parts.forEach((p: any, idx: number) => {
          if (p.inlineData) {
            const dataLen = p.inlineData.data ? p.inlineData.data.length : 0;
            logDebug(`[Gemini Extract] Part[${idx}]: InlineData mimeType="${p.inlineData.mimeType}", data length = ${dataLen} characters (Base64)`);
            if (dataLen > 100) {
              const headBase64 = p.inlineData.data.substring(0, 40);
              logDebug(`[Gemini Extract] Part[${idx}]: Inicio do base64: "${headBase64}"`);
            }
          } else if (p.text) {
            logDebug(`[Gemini Extract] Part[${idx}]: Text segment (prompt) length = ${p.text.length}`);
          } else {
            logDebug(`[Gemini Extract] Part[${idx}]: Unknown style part`);
          }
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let response;
      let usedModel = model || "gemini-3.1-flash-lite";
      logDebug(`[Gemini Extract] Iniciando chamada com modelo: ${usedModel}...`);

      try {
        response = await ai.models.generateContent({
          model: usedModel,
          contents: [{ role: 'user', parts }],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema || undefined
          }
        });
      } catch (firstErr: any) {
        const firstErrStr = String(firstErr.message || firstErr.details || firstErr);
        logDebug(`[Gemini Extract] Falha ao executar com o modelo ${usedModel}: ${firstErrStr}`);

        if (usedModel === "gemini-3.1-flash-lite") {
          usedModel = "gemini-2.5-flash";
          logDebug(`[Gemini Extract] Fazendo fallback automático para o modelo alternativo altamente disponível: ${usedModel}...`);
          try {
            response = await ai.models.generateContent({
              model: usedModel,
              contents: [{ role: 'user', parts }],
              config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema || undefined
              }
            });
          } catch (fallbackErr: any) {
            logDebug(`[Gemini Extract] Falha no fallback para o modelo ${usedModel}: ${fallbackErr.message || String(fallbackErr)}`);
            throw firstErr; // Throw original error if fallback also fails
          }
        } else {
          throw firstErr;
        }
      }

      logDebug(`[Gemini Extract] Resposta gerada com sucesso pela API Gemini usando modelo ${usedModel}.`);
      res.json({ text: response.text });
    } catch (err: any) {
      logDebug(`[Gemini Extract Error] Erro final ao chamar a API Gemini: ${err.message || String(err)}`);
      console.error("[Gemini Server] Erro ao chamar a API Gemini:", err);
      
      let friendlyError = "Erro no processamento da API Gemini pelo servidor";
      const errStr = String(err.message || err.details || err);
      
      if (errStr.includes("The document has no pages")) {
        friendlyError = "O arquivo PDF enviado parece não conter nenhuma página válida ou está em branco. Certifique-se de que o documento não esteja protegido ou corrompido.";
      } else if (errStr.includes("Unsupported mime type") || (errStr.includes("INVALID_ARGUMENT") && (errStr.includes("mime") || errStr.includes("type")))) {
        friendlyError = "O formato de arquivo enviado não é suportado pelo analisador de documentos. Por favor, utilize PDF ou Imagens (PNG, JPG, WEBP).";
      } else if (errStr.includes("Resource has been exhausted") || errStr.includes("429")) {
        friendlyError = "Limite de requisições do Gemini excedido temporariamente. Por favor, tente novamente em instantes.";
      } else if (errStr.includes("API_KEY_INVALID") || errStr.includes("API key not valid")) {
        friendlyError = "A chave de API do Gemini configurada é inválida ou expirou. Verifique as configurações de secrets do servidor.";
      }
      
      res.status(500).json({ 
        error: friendlyError, 
        details: err.message || String(err)
      });
    }
  });

  // Assinafy Electronic Signature API Integration Routes
  app.post("/api/assinafy/create-envelope", async (req, res) => {
    console.log("[Assinafy Endpoint] Recebeu requisição. Chaves no body:", Object.keys(req.body || {}));
    const { apiToken, documentBase64, documentName, signers, isSandbox } = req.body;
    
    console.log("[Assinafy Endpoint] documentBase64 length:", documentBase64 ? documentBase64.length : 0);
    console.log("[Assinafy Endpoint] Is signers array:", Array.isArray(signers), "length:", signers ? signers.length : 0);
    if (signers && Array.isArray(signers)) {
      console.log("[Assinafy Endpoint] Signers content:", JSON.stringify(signers));
    }

    if (!documentBase64 || !signers || !Array.isArray(signers) || signers.length === 0) {
      console.log("[Assinafy Endpoint] Erro: parâmetros obrigatórios ausentes!");
      return res.status(400).json({ error: "Parâmetros obrigatórios ausentes: documentBase64 e signers" });
    }

    // Sandbox / Simulation Mode
    if (isSandbox || !apiToken) {
      console.log("[Assinafy Endpoint] Executando em modo Sandbox de Simulação.");
      const envelopeId = "env_" + Math.random().toString(36).substring(2, 12);
      const simulatedSigners = signers.map((s, idx) => ({
        ...s,
        id: `sig_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        status: "Pendente",
        signUrl: `https://app.assinafy.com.br/sign/${envelopeId}/${idx}`
      }));

      return res.json({
        success: true,
        isSandbox: true,
        envelopeId,
        documentName,
        status: "Pendente",
        signers: simulatedSigners,
        viewUrl: `https://app.assinafy.com.br/envelopes/${envelopeId}`,
        created_at: new Date().toISOString()
      });
    }

    try {
      console.log(`[Assinafy API] Iniciando envio real de envelope usando o SDK oficial: "${documentName}"...`);
      
      const clientOptions: any = {};
      const tokenStr = String(apiToken).trim();
      if (tokenStr.startsWith("k_")) {
        clientOptions.apiKey = tokenStr;
      } else {
        clientOptions.token = tokenStr;
      }

      const client = new AssinafyClient(clientOptions);

      // Listar workspaces do usuário para encontrar o account_id correto automaticamente
      console.log("[Assinafy API] Buscando workspaces/contas associadas ao token...");
      const workspacesResult = await client.workspaces.list();
      const workspaces = workspacesResult.data;
      if (!workspaces || workspaces.length === 0) {
        throw new Error("Nenhuma conta ou workspace encontrada para esta credencial do Assinafy.");
      }
      const accountId = workspaces[0].id;
      console.log(`[Assinafy API] Usando accountId: ${accountId} (Nome: ${workspaces[0].name || 'Padrão'})`);

      // Converter o base64 para Buffer
      const buffer = Buffer.from(documentBase64, "base64");

      // Fazer o upload e requisitar assinaturas usando o helper de alto nível do SDK oficial
      console.log("[Assinafy API] Executando upload e solicitação de assinaturas...");
      const result = await client.uploadAndRequestSignatures({
        source: { buffer, fileName: documentName },
        accountId,
        signers: signers.map((s: any) => ({
          name: s.name ? String(s.name).trim() : "",
          email: s.email ? String(s.email).trim() : undefined,
          whatsapp_phone_number: s.phone || s.whatsapp_phone_number ? String(s.phone || s.whatsapp_phone_number).trim() : undefined,
          cpf: s.cpf ? String(s.cpf).replace(/[^\d]/g, "") : undefined,
          metadata: { role: s.role === "Testemunha" ? "witness" : "signer" }
        })),
        waitForReady: true
      });

      console.log("[Assinafy API] Fluxo do SDK concluído com sucesso:", {
        documentId: result.document.id,
        status: result.document.status
      });

      const signingUrls = result.assignment.signing_urls || [];
      const mappedSigners = (result.assignment.signers || []).map((s: any, idx: number) => {
        const urlObj = signingUrls.find((su: any) => su.signer_id === s.id);
        return {
          name: s.full_name || signers[idx]?.name,
          email: s.email || signers[idx]?.email,
          cpf: s.cpf || signers[idx]?.cpf,
          role: signers[idx]?.role || "signer",
          status: s.status || "Pendente",
          signUrl: urlObj?.url || `https://app.assinafy.com.br/sign/${result.document.id}/${idx}`
        };
      });

      res.json({
        success: true,
        isSandbox: false,
        envelopeId: result.document.id,
        status: result.document.status || "Pendente",
        signers: mappedSigners,
        viewUrl: (result.document as any).signing_url || `https://app.assinafy.com.br/envelopes/${result.document.id}`,
        created_at: result.document.created_at || new Date().toISOString()
      });
    } catch (apiError: any) {
      console.error("[Assinafy API Error] Erro ao integrar com a Assinafy real:", apiError.message, apiError.context || apiError.responseData || apiError);
      
      let errorDetail = apiError.message;
      if (apiError.responseData) {
        errorDetail = typeof apiError.responseData === "object" ? JSON.stringify(apiError.responseData) : String(apiError.responseData);
      } else if (apiError.context) {
        errorDetail = typeof apiError.context === "object" ? JSON.stringify(apiError.context) : String(apiError.context);
      }

      res.status(apiError.statusCode || 500).json({
        success: false,
        error: "Erro na autenticação ou processamento da API Assinafy",
        details: errorDetail,
        suggestSandbox: true
      });
    }
  });

  app.get("/api/assinafy/status/:envelopeId", async (req, res) => {
    const { envelopeId } = req.params;
    const { apiToken, isSandbox } = req.query;

    if (isSandbox === "true" || !apiToken) {
      // Simular status atualizado para modo sandbox
      return res.json({
        success: true,
        isSandbox: true,
        envelopeId,
        status: "Pendente"
      });
    }

    try {
      console.log(`[Assinafy API] Buscando status real do envelope/documento: ${envelopeId}...`);
      
      const clientOptions: any = {};
      const tokenStr = String(apiToken).trim();
      if (tokenStr.startsWith("k_")) {
        clientOptions.apiKey = tokenStr;
      } else {
        clientOptions.token = tokenStr;
      }

      const client = new AssinafyClient(clientOptions);
      const details = await client.documents.details(envelopeId);

      const assignment = (details as any).assignment || {};
      const signersList = (assignment as any).signers || [];
      const signingUrls = (assignment as any).signing_urls || [];

      const mappedSigners = signersList.map((s: any, idx: number) => {
        const urlObj = signingUrls.find((su: any) => su.signer_id === s.id);
        return {
          name: s.full_name || s.name,
          email: s.email,
          cpf: s.cpf,
          role: s.metadata?.role || "signer",
          status: s.status || "Pendente",
          signUrl: urlObj?.url || s.sign_url || s.link
        };
      });

      res.json({
        success: true,
        isSandbox: false,
        status: details.status || "Pendente",
        signers: mappedSigners
      });
    } catch (err: any) {
      console.error("[Assinafy API Status Error] Erro ao obter status do documento:", err.message, err.responseData || err);
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message,
        details: err.responseData ? JSON.stringify(err.responseData) : undefined
      });
    }
  });

  // ==========================================
  // --- ASAAS PAYMENT & COMMISSION INTEGRATION ---
  // ==========================================
  let mockAsaasBalance = 45320.80;
  let mockAsaasCustomers: any[] = [
    { id: "cus_001", name: "João Silva", cpfCnpj: "123.456.789-01", email: "joao.silva@email.com", phone: "11987654321" },
    { id: "cus_002", name: "Maria Oliveira", cpfCnpj: "987.654.321-02", email: "maria.oliveira@email.com", phone: "11999998888" }
  ];
  let mockAsaasPayments: any[] = [
    {
      id: "pay_001",
      customer: "cus_001",
      customerName: "João Silva",
      value: 12500.00,
      dueDate: "2026-07-20",
      billingType: "PIX",
      status: "PENDING",
      description: "Sinal de Corretagem - Edifício Harmony - Ap 402",
      pixCopyPaste: "00020101021126580014br.gov.bcb.pix0136asaas-pix-chave-aleatoria-simulacao520400005303986540812500.005802BR5915Asaas-Simulador6009Sao Paulo62070503***6304abcd",
      barCode: "34191.79001 01043.513184 91020.150008 7 97810001250000",
      invoiceUrl: "https://sandbox.asaas.com/i/pay_001",
      split: [
        { walletId: "wall_corretor", name: "Lucas Corretor", value: 7500.00, percentualValue: 60 },
        { walletId: "wall_gerente", name: "Roberto Gerente", value: 5000.00, percentualValue: 40 }
      ],
      created_at: new Date().toISOString()
    }
  ];
  let mockAsaasTransfers: any[] = [
    {
      id: "tx_001",
      value: 4500.00,
      pixAddressKey: "12345678901",
      pixAddressKeyType: "CPF",
      status: "CONFIRMED",
      description: "Repasse Comissão - Lucas Corretor",
      name: "Lucas Corretor",
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];

  const getAsaasClient = (apiToken: string, isSandbox: boolean) => {
    const baseURL = isSandbox 
      ? "https://sandbox.asaas.com/api/v3" 
      : "https://api.asaas.com/api/v3";
    
    return axios.create({
      baseURL,
      headers: {
        "access_token": apiToken.trim(),
        "Content-Type": "application/json"
      },
      timeout: 15000
    });
  };

  const getAsaasCredentials = (req: any) => {
    const apiToken = req.body.apiToken || process.env.ASAAS_API_KEY;
    const isSandbox = req.body.isSandbox !== undefined ? req.body.isSandbox : (process.env.ASAAS_ENV !== 'production');
    return { apiToken: apiToken ? String(apiToken).trim() : "", isSandbox };
  };

  const formatAsaasErrorLog = (err: any): string => {
    if (err.response?.data) {
      const data = err.response.data;
      if (data.errors && Array.isArray(data.errors)) {
        return data.errors.map((e: any) => `[${e.code || 'ERROR'}] ${e.description}`).join('; ');
      }
      return typeof data === 'object' ? JSON.stringify(data) : String(data);
    }
    return err.message;
  };

  // Balance Endpoint
  app.post("/api/asaas/balance", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);
    
    if (!apiToken) {
      return res.json({
        success: true,
        isSandbox: true,
        balance: mockAsaasBalance
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      const response = await client.get("/finance/balance");
      return res.json({
        success: true,
        isSandbox,
        balance: response.data.balance
      });
    } catch (err: any) {
      console.warn("[Asaas API Balance Info]: Falling back to simulation. Reason:", formatAsaasErrorLog(err));
      return res.json({
        success: true,
        isSandbox,
        balance: mockAsaasBalance,
        isFallback: true,
        apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Customers List Endpoint
  app.post("/api/asaas/customers/list", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);
    
    if (!apiToken) {
      return res.json({
        success: true,
        isSandbox: true,
        data: mockAsaasCustomers
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      const response = await client.get("/customers", { params: { limit: 100 } });
      return res.json({
        success: true,
        isSandbox,
        data: response.data.data || []
      });
    } catch (err: any) {
      console.warn("[Asaas API Customers List Info]: Falling back to simulation. Reason:", formatAsaasErrorLog(err));
      return res.json({
        success: true,
        isSandbox,
        data: mockAsaasCustomers,
        isFallback: true,
        apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Customer Create Endpoint
  app.post("/api/asaas/customers/create", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);
    const { name, cpfCnpj, email, phone } = req.body;

    if (!name || !cpfCnpj) {
      return res.status(400).json({ success: false, error: "Nome e CPF/CNPJ são obrigatórios para cadastrar cliente." });
    }

    if (!apiToken) {
      const newCustomer = {
        id: "cus_" + Math.random().toString(36).substring(2, 10),
        name,
        cpfCnpj,
        email: email || "",
        phone: phone || ""
      };
      mockAsaasCustomers.push(newCustomer);
      return res.json({
        success: true,
        isSandbox: true,
        data: newCustomer
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      const response = await client.post("/customers", {
        name,
        cpfCnpj: String(cpfCnpj).replace(/[^\d]/g, ""),
        email: email || undefined,
        phone: phone || undefined
      });
      return res.json({
        success: true,
        isSandbox,
        data: response.data
      });
    } catch (err: any) {
      console.warn("[Asaas API Customer Create Info]:", formatAsaasErrorLog(err));
      if (isSandbox) {
        console.warn("[Asaas API Customer Create Info]: Falling back to simulation");
        const newCustomer = {
          id: "cus_sim_" + Math.random().toString(36).substring(2, 10),
          name,
          cpfCnpj,
          email: email || "",
          phone: phone || ""
        };
        mockAsaasCustomers.push(newCustomer);
        return res.json({
          success: true,
          isSandbox: true,
          isSimulatedFallback: true,
          data: newCustomer,
          apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
        });
      }
      return res.status(err.response?.status || 500).json({
        success: false,
        error: "Erro ao cadastrar cliente no Asaas",
        details: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Payments List Endpoint
  app.post("/api/asaas/payments/list", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);

    if (!apiToken) {
      return res.json({
        success: true,
        isSandbox: true,
        data: mockAsaasPayments
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      const response = await client.get("/payments", { params: { limit: 100 } });
      return res.json({
        success: true,
        isSandbox,
        data: response.data.data || []
      });
    } catch (err: any) {
      console.warn("[Asaas API Payments List Info]: Falling back to simulation. Reason:", formatAsaasErrorLog(err));
      return res.json({
        success: true,
        isSandbox,
        data: mockAsaasPayments,
        isFallback: true,
        apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Create Payment / Charge Endpoint (supports splits!)
  app.post("/api/asaas/payments/create", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);
    const { 
      customerId, 
      customerName, 
      customerCpfCnpj, 
      customerEmail, 
      customerPhone, 
      value, 
      dueDate, 
      billingType, 
      description, 
      splitRules 
    } = req.body;

    if (!value || !dueDate || !billingType) {
      return res.status(400).json({ success: false, error: "Parâmetros obrigatórios ausentes: value, dueDate, billingType." });
    }

    let finalCustomerId = customerId;
    const cleanCpfCnpj = String(customerCpfCnpj || "").replace(/[^\d]/g, "");

    // 1. Auto-resolve or Auto-create Customer if customerId is empty
    if (!finalCustomerId && cleanCpfCnpj) {
      if (!apiToken) {
        // Simulation / Sandbox fallback
        const existingSim = mockAsaasCustomers.find(c => String(c.cpfCnpj).replace(/[^\d]/g, "") === cleanCpfCnpj);
        if (existingSim) {
          finalCustomerId = existingSim.id;
        } else {
          const newSim = {
            id: "cus_sim_" + Math.random().toString(36).substring(2, 10),
            name: customerName || "Cliente Auto-Viculado",
            cpfCnpj: customerCpfCnpj,
            email: customerEmail || "",
            phone: customerPhone || ""
          };
          mockAsaasCustomers.push(newSim);
          finalCustomerId = newSim.id;
        }
      } else {
        // Real API call
        try {
          const client = getAsaasClient(apiToken, isSandbox);
          const searchRes = await client.get("/customers", { params: { cpfCnpj: cleanCpfCnpj } });
          if (searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {
            finalCustomerId = searchRes.data.data[0].id;
            console.log("[Asaas API] Cliente existente vinculado com sucesso por CPF/CNPJ:", finalCustomerId);
          } else {
            // Create new customer on-the-fly
            const createRes = await client.post("/customers", {
              name: customerName || "Cliente Auto-Vinculado",
              cpfCnpj: cleanCpfCnpj,
              email: customerEmail || undefined,
              phone: customerPhone || undefined
            });
            finalCustomerId = createRes.data.id;
            console.log("[Asaas API] Novo cliente criado e vinculado com sucesso:", finalCustomerId);
          }
        } catch (err: any) {
          console.error("[Asaas API] Erro ao buscar ou criar cliente para o boleto:", err.message);
          // Fallback if needed, but we don't block yet
        }
      }
    }

    // Default simulation/sandbox fallback if customer could not be resolved or created
    if (!finalCustomerId) {
      finalCustomerId = "cus_fallback_" + Math.random().toString(36).substring(2, 8);
    }

    if (!apiToken) {
      const pId = "pay_" + Math.random().toString(36).substring(2, 10);
      const newPayment = {
        id: pId,
        customer: finalCustomerId,
        customerName: customerName || "Cliente Simulado",
        value: parseFloat(value),
        dueDate,
        billingType,
        status: "PENDING",
        description: description || "Cobrança de comissão imobiliária",
        pixCopyPaste: "00020101021126580014br.gov.bcb.pix0136asaas-pix-chave-aleatoria-simulacao5204000053039865408" + parseFloat(value).toFixed(2) + "5802BR5915Asaas-Simulador6009Sao Paulo62070503***6304abcd",
        barCode: "34191.79001 01043.513184 91020.150008 7 9781" + String(Math.floor(parseFloat(value) * 100)).padStart(10, '0'),
        invoiceUrl: "https://sandbox.asaas.com/i/" + pId,
        bankSlipUrl: "https://sandbox.asaas.com/b/pdf/" + pId,
        split: splitRules || [],
        created_at: new Date().toISOString()
      };
      mockAsaasPayments.unshift(newPayment);
      return res.json({
        success: true,
        isSandbox: true,
        data: newPayment
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      
      const payload: any = {
        customer: finalCustomerId,
        billingType,
        value: parseFloat(value),
        dueDate,
        description: description || undefined
      };

      if (splitRules && Array.isArray(splitRules) && splitRules.length > 0) {
        payload.split = splitRules.map((sr: any) => {
          const rule: any = { walletId: sr.walletId };
          if (sr.percentualValue !== undefined) {
            rule.percentualValue = parseFloat(sr.percentualValue);
          } else if (sr.fixedValue !== undefined) {
            rule.fixedValue = parseFloat(sr.fixedValue);
          } else if (sr.value !== undefined) {
            rule.fixedValue = parseFloat(sr.value);
          }
          return rule;
        });
      }

      console.log("[Asaas API] Enviando cobrança real:", JSON.stringify(payload));
      const response = await client.post("/payments", payload);
      return res.json({
        success: true,
        isSandbox,
        data: response.data
      });
    } catch (err: any) {
      console.warn("[Asaas API Payment Create Info]:", formatAsaasErrorLog(err));
      if (isSandbox) {
        console.warn("[Asaas API Payment Create Info]: Falling back to simulation");
        const pId = "pay_sim_" + Math.random().toString(36).substring(2, 10);
        const newPayment = {
          id: pId,
          customer: customerId,
          customerName: customerName || "Cliente Simulado",
          value: parseFloat(value),
          dueDate,
          billingType,
          status: "PENDING",
          description: (description || "Cobrança de comissão imobiliária") + " (Simulação - Erro API)",
          pixCopyPaste: "00020101021126580014br.gov.bcb.pix0136asaas-pix-chave-aleatoria-simulacao5204000053039865408" + parseFloat(value).toFixed(2) + "5802BR5915Asaas-Simulador6009Sao Paulo62070503***6304abcd",
          barCode: "34191.79001 01043.513184 91020.150008 7 9781" + String(Math.floor(parseFloat(value) * 100)).padStart(10, '0'),
          invoiceUrl: "https://sandbox.asaas.com/i/" + pId,
          bankSlipUrl: "https://sandbox.asaas.com/b/pdf/" + pId,
          split: splitRules || [],
          created_at: new Date().toISOString()
        };
        mockAsaasPayments.unshift(newPayment);
        return res.json({
          success: true,
          isSandbox: true,
          isSimulatedFallback: true,
          data: newPayment,
          apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
        });
      }
      return res.status(err.response?.status || 500).json({
        success: false,
        error: "Erro ao criar cobrança no Asaas",
        details: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Simulate Payment Received / Paid
  app.post("/api/asaas/payments/simulate-payment", async (req, res) => {
    const { paymentId } = req.body;
    
    const paymentIndex = mockAsaasPayments.findIndex(p => p.id === paymentId);
    if (paymentIndex === -1) {
      return res.status(404).json({ success: false, error: "Cobrança simulada não encontrada." });
    }

    const p = mockAsaasPayments[paymentIndex];
    if (p.status !== "PENDING") {
      return res.status(400).json({ success: false, error: "Esta cobrança já foi recebida ou cancelada." });
    }

    p.status = "RECEIVED";
    mockAsaasBalance += p.value;

    if (p.split && Array.isArray(p.split)) {
      p.split.forEach((sp: any) => {
        const splitVal = sp.fixedValue || (p.value * (sp.percentualValue / 100));
        mockAsaasBalance -= splitVal;
        
        mockAsaasTransfers.unshift({
          id: "tx_split_" + Math.random().toString(36).substring(2, 6),
          value: splitVal,
          pixAddressKey: sp.walletId || "wallet_split",
          pixAddressKeyType: "OUTRO",
          status: "CONFIRMED",
          description: `Repasse Automático Split - ${sp.name || 'Parceiro'}`,
          name: sp.name || 'Parceiro Split',
          created_at: new Date().toISOString()
        });
      });
    }

    return res.json({
      success: true,
      message: "Cobrança simulada como recebida com sucesso! Saldo e split atualizados.",
      data: p,
      newBalance: mockAsaasBalance
    });
  });

  // Transfers List Endpoint
  app.post("/api/asaas/transfers/list", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);

    if (!apiToken) {
      return res.json({
        success: true,
        isSandbox: true,
        data: mockAsaasTransfers
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      const response = await client.get("/transfers", { params: { limit: 100 } });
      return res.json({
        success: true,
        isSandbox,
        data: response.data.data || []
      });
    } catch (err: any) {
      console.warn("[Asaas API Transfers List Info]: Falling back to simulation. Reason:", formatAsaasErrorLog(err));
      return res.json({
        success: true,
        isSandbox,
        data: mockAsaasTransfers,
        isFallback: true,
        apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  // Create Transfer (Pix payout to participant)
  app.post("/api/asaas/transfers/create", async (req, res) => {
    const { apiToken, isSandbox } = getAsaasCredentials(req);
    const value = req.body.value;
    const pixAddressKey = req.body.pixAddressKey || req.body.pixKey;
    const pixAddressKeyType = req.body.pixAddressKeyType || req.body.pixKeyType;
    const { description, name, cpfCnpj } = req.body;

    if (!value || !pixAddressKey || !pixAddressKeyType) {
      return res.status(400).json({ success: false, error: "Parâmetros obrigatórios ausentes: value, pixAddressKey (ou pixKey), pixAddressKeyType (ou pixKeyType)." });
    }

    if (!apiToken) {
      const parsedValue = parseFloat(value);
      if (parsedValue > mockAsaasBalance) {
        return res.status(400).json({ success: false, error: "Saldo insuficiente na conta Asaas simulada para este repasse." });
      }

      mockAsaasBalance -= parsedValue;
      const newTransfer = {
        id: "tx_" + Math.random().toString(36).substring(2, 10),
        value: parsedValue,
        pixAddressKey,
        pixAddressKeyType,
        status: "CONFIRMED",
        description: description || "Repasse de comissão simulado",
        name: name || "Profissional",
        cpfCnpj: cpfCnpj || "",
        created_at: new Date().toISOString()
      };
      mockAsaasTransfers.unshift(newTransfer);

      return res.json({
        success: true,
        isSandbox: true,
        data: newTransfer,
        newBalance: mockAsaasBalance
      });
    }

    try {
      const client = getAsaasClient(apiToken, isSandbox);
      
      const payload: any = {
        value: parseFloat(value),
        operationType: "PIX",
        pixAddressKey,
        pixAddressKeyType,
        description: description || undefined
      };

      console.log("[Asaas API] Executando transferência real:", JSON.stringify(payload));
      const response = await client.post("/transfers", payload);
      return res.json({
        success: true,
        isSandbox,
        data: response.data
      });
    } catch (err: any) {
      console.warn("[Asaas API Transfer Create Info]: Falling back to simulation. Reason:", formatAsaasErrorLog(err));
      if (isSandbox) {
        const parsedValue = parseFloat(value);
        mockAsaasBalance = Math.max(0, mockAsaasBalance - parsedValue);
        const newTransfer = {
          id: "tx_sim_" + Math.random().toString(36).substring(2, 10),
          value: parsedValue,
          pixAddressKey,
          pixAddressKeyType,
          status: "CONFIRMED",
          description: (description || "Repasse de comissão") + " (Simulação - Erro API)",
          name: name || "Profissional",
          cpfCnpj: cpfCnpj || "",
          created_at: new Date().toISOString()
        };
        mockAsaasTransfers.unshift(newTransfer);
        return res.json({
          success: true,
          isSandbox: true,
          isSimulatedFallback: true,
          data: newTransfer,
          newBalance: mockAsaasBalance,
          apiError: err.response?.data ? JSON.stringify(err.response.data) : err.message
        });
      }
      return res.status(err.response?.status || 500).json({
        success: false,
        error: "Erro ao realizar transferência no Asaas",
        details: err.response?.data ? JSON.stringify(err.response.data) : err.message
      });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Catch-all handler for unmatched /api routes (prevents fallthrough to Vite SPA index.html)
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.path}` });
  });

  // Global Express error handler for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api") || req.url.startsWith("/api")) {
      console.error("[API Error Handler]", err);
      const statusCode = err.status || err.statusCode || 500;
      return res.status(statusCode).json({
        error: err.message || "Erro interno do servidor",
        code: err.code || "INTERNAL_SERVER_ERROR"
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = fs.existsSync(path.join(process.cwd(), "dist", "index.html"))
      ? path.join(process.cwd(), "dist")
      : (fs.existsSync(path.join(_dirname, "index.html")) ? _dirname : path.join(_dirname, "dist"));

    console.log(`[Production] Servindo arquivos estáticos de: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
