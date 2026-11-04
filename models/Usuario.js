const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },

  whatsapp: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  correo: {
    type: String,
    lowercase: true,
    trim: true,
    sparse: true
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  estado: {
    type: String,
    enum: ['pendiente', 'aprobado', 'rechazado'],
    default: 'pendiente'
  },

  rol: {
    type: String,
    enum: ['cliente', 'admin'],
    default: 'cliente'
  },

  creado: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Usuario', usuarioSchema);
