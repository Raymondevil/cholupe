const mongoose = require('mongoose');

async function conectarDB() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cholupe'
    );

    console.log('MongoDB conectado correctamente');
  } catch (error) {
    console.error('Error al conectar MongoDB:', error.message);
    process.exit(1);
  }
}

module.exports = conectarDB;
