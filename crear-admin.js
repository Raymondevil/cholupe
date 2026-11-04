
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const readline = require('readline');

const Usuario = require('./models/Usuario');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function preguntar(texto) {
  return new Promise(resolve => {
    rl.question(texto, resolve);
  });
}

function preguntarPassword() {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;

    if (!stdin.isTTY || !stdin.setRawMode) {
      return reject(new Error('Ejecuta este programa desde una terminal interactiva.'));
    }

    let password = '';

    process.stdout.write('Contraseña del administrador: ');
    stdin.setRawMode(true);
    stdin.resume();

    function recibir(tecla) {
      const caracter = tecla.toString();

      if (caracter === '\u0003') {
        stdin.setRawMode(false);
        stdin.pause();
        reject(new Error('Operación cancelada.'));
        return;
      }

      if (caracter === '\r' || caracter === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', recibir);
        process.stdout.write('\n');
        resolve(password);
        return;
      }

      if (caracter === '\u007f' || caracter === '\b') {
        password = password.slice(0, -1);
        return;
      }

      if (caracter >= ' ' && caracter <= '~') {
        password += caracter;
      }
    }

    stdin.on('data', recibir);
  });
}

async function crearAdmin() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cholupe'
    );

    const existente = await Usuario.findOne({ rol: 'admin' });

    if (existente) {
      console.log('Ya existe un administrador. No se creó otro.');
      return;
    }

    const nombre = (await preguntar('Nombre del administrador: ')).trim();
    const whatsapp = (await preguntar('WhatsApp con código de país: '))
      .replace(/\D/g, '');

    const password = await preguntarPassword();

    if (nombre.length < 2 || nombre.length > 80) {
      throw new Error('El nombre debe tener entre 2 y 80 caracteres.');
    }

    if (whatsapp.length < 10 || whatsapp.length > 15) {
      throw new Error('El número de WhatsApp no es válido.');
    }

    if (password.length < 12 || password.length > 128) {
      throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await Usuario.create({
      nombre,
      whatsapp,
      password: passwordHash,
      estado: 'aprobado',
      rol: 'admin'
    });

    console.log('Administrador creado correctamente.');

  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
}

crearAdmin();

