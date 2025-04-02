// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const { db } = require('./config/firebase');
const authRoutes = require('./routes/authRoutes');
const logsController = require('./controllers/logsController');

const app = express();

// Configuración de Winston para logs
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/all.log', level: 'info' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Middleware de logging
app.use((req, res, next) => {
  const startTime = Date.now();
  let statusCode;

  const originalSend = res.send;
  res.send = function (body) {
    statusCode = res.statusCode;
    originalSend.call(this, body);
  };

  res.on("finish", async () => {
    const responseTime = Date.now() - startTime;
    const logData = {
      logLevel: statusCode >= 400 ? "error" : "info",
      timestamp: new Date(),
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      status: statusCode || res.statusCode,
      responseTime,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      protocol: req.protocol,
      host: req.hostname,
      system: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
        pid: process.pid,
      },
    };

    // Registrar logs usando Winston
    logger.log({ level: logData.logLevel, message: "Request completed", ...logData });
    try {
      await db.collection("logs").add(logData); // Guarda el log en Firestore
    } catch (error) {
      logger.error("Error al guardar log en Firestore:", error);
    }
  });
  next();
});

// Middlewares
app.use(express.json());
app.use(cors());

// Rutas
app.use('/api/auth', authRoutes); // Rutas de autenticación
app.use('/api/logs', logsController.getLogs); // Ruta para obtener logs

// Puerto y servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
