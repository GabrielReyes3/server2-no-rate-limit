const { validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { admin } = require('../config/firebase'); // ✅ Importar desde firebase.js
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const express = require('express');
const app = express();


// Inicializar Firestore
const db = admin.firestore();
const usersCollection = db.collection('users');
const logsCollection = db.collection('logs');

// Ruta GET para obtener la información
app.get('/getInfo', (req, res) => {
    // Información hardcoding del Alumno
    const alumno = {
      nombreCompleto: 'Gabriel Reyes',
      grupo: 'IDGS11'
    };
  
    // Información de la versión de Node.js
    const info = {
      versionNode: process.version,
      alumno: alumno
    };
  
    // Enviar la respuesta en formato JSON
    res.json(info);
  });

  

// 🔹 Registro de usuario
exports.register = async (req, res) => {
    // Validar errores de los datos enviados
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password, grado, grupo } = req.body;

    // Verificar que todos los campos requeridos están presentes
    if (!email || !username || !password || !grado || !grupo) {
        return res.status(400).json({ msg: 'Todos los campos son requeridos' });
    }

    // Validar que grado y grupo sean cadenas de texto
    if (typeof grado !== 'string' || typeof grupo !== 'string') {
        return res.status(400).json({ msg: 'Grado y grupo deben ser cadenas de texto' });
    }

    const normalizedEmail = email.toLowerCase();

    try {
        // Verificar si el usuario ya existe
        const existingUser = await usersCollection.where('email', '==', normalizedEmail).get();
        if (!existingUser.empty) {
            return res.status(400).json({ msg: 'El usuario ya está registrado' });
        }

        // Hashear la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generar clave secreta para MFA
        const secret = speakeasy.generateSecret({ length: 20 });

        // Crear usuario en Firestore
        // Crear usuario en Firestore con el correo como ID
        await usersCollection.doc(normalizedEmail).set({
            email: normalizedEmail,
            username,
            password: hashedPassword,
            grado,
            grupo,
            mfaSecret: secret.base32,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Generar código QR para MFA
        const qrCode = await qrcode.toDataURL(secret.otpauth_url);

        // Responder con mensaje de éxito y el QR
        res.status(201).json({
            msg: 'Usuario registrado exitosamente',
            qrCode,
        });
    } catch (error) {
        res.status(500).json({ msg: 'Error en el servidor' });
    }
};

// 🔹 Login de usuario con contraseña o MFA
exports.login = async (req, res) => {
    // Validar errores de los datos enviados
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, token, useMFA } = req.body;
    
    if (!email) {
        return res.status(400).json({ msg: 'El email es obligatorio' });
    }
    
    const normalizedEmail = email.toLowerCase();

    try {
        // Buscar usuario por email
        const userSnapshot = await usersCollection.doc(normalizedEmail).get();
        if (!userSnapshot.exists) {
            return res.status(400).json({ msg: 'Usuario no encontrado' });
        }

        const userData = userSnapshot.data();

        if (useMFA) {
            // Validar código MFA
            if (!userData.mfaSecret) {
                return res.status(400).json({ msg: 'MFA no configurado para este usuario' });
            }
            const verified = speakeasy.totp.verify({
                secret: userData.mfaSecret,
                encoding: 'base32',
                token,
            });
            if (!verified) {
                return res.status(400).json({ msg: 'Código MFA incorrecto' });
            }
        } else {
            // Validar contraseña
            if (!password || !userData.password) {
                return res.status(400).json({ msg: 'Credenciales inválidas' });
            }
            const validPassword = await bcrypt.compare(password, userData.password);
            if (!validPassword) {
                return res.status(400).json({ msg: 'Credenciales inválidas' });
            }
        }

        // Generar token JWT
        const tokenJWT = jwt.sign(
            { email: userData.email, username: userData.username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ msg: 'Inicio de sesión exitoso', token: tokenJWT });
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ msg: 'Error en el servidor' });
    }
};
