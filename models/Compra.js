const mongoose = require('mongoose');

const compraSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },

  fotos: {
    type: [{
      type: String,
      match: /^foto_\d+\.jpg$/
    }],
    default: []
  },

  paqueteVideos: {
    type: Boolean,
    default: false
  },

  total: {
    type: Number,
    required: true,
    min: 50
  },

  estado: {
    type: String,
    enum: [
      'pendiente_pago',
      'pendiente_revision',
      'aprobada',
      'rechazada'
    ],
    default: 'pendiente_pago'
  },

  comprobante: {
    type: String,
    default: null
  },

  revisadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    default: null
  },

  fechaRevision: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Compra', compraSchema);
