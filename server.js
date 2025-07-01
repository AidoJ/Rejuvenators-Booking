const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// In-memory bookings store (replace with DB/Supabase later)
const bookings = {};

// Nodemailer setup (replace with EmailJS or other in prod)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Helper: send email (customize for Rejuvenator style)
function sendEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html
  });
}

// POST /api/bookings - Create a new booking
app.post('/api/bookings', async (req, res) => {
  const booking = req.body;
  const id = 'b_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  booking.id = id;
  booking.status = 'pending';
  booking.therapistIndex = 0;
  bookings[id] = booking;

  // Send acknowledgment email to customer (customize as needed)
  await sendEmail({
    to: booking.customerEmail,
    subject: 'Booking Request Received',
    html: `<h2>Thank you for your booking, ${booking.customerName}!</h2><p>We are contacting therapists now.</p>`
  });

  // Send request email to first therapist (customize as needed)
  const therapist = booking.therapists[0];
  await sendEmail({
    to: therapist.email,
    subject: 'New Booking Request',
    html: `<h2>New Booking for ${therapist.name}</h2><p>Click <a href="${process.env.FRONTEND_URL}/therapist-response?id=${id}&action=accept">Accept</a> or <a href="${process.env.FRONTEND_URL}/therapist-response?id=${id}&action=decline">Decline</a></p>`
  });

  // Start timer for fallback (60 min)
  setTimeout(() => {
    const b = bookings[id];
    if (b && b.status === 'pending') {
      // Fallback to next therapist
      b.therapistIndex++;
      if (b.therapistIndex < b.therapists.length) {
        const nextTherapist = b.therapists[b.therapistIndex];
        sendEmail({
          to: nextTherapist.email,
          subject: 'New Booking Request',
          html: `<h2>New Booking for ${nextTherapist.name}</h2><p>Click <a href="${process.env.FRONTEND_URL}/therapist-response?id=${id}&action=accept">Accept</a> or <a href="${process.env.FRONTEND_URL}/therapist-response?id=${id}&action=decline">Decline</a></p>`
        });
      } else {
        b.status = 'no_response';
        // Optionally notify admin/customer
      }
    }
  }, 60 * 60 * 1000); // 60 minutes

  res.json({ id });
});

// GET /api/bookings/:id - Get booking status
app.get('/api/bookings/:id', (req, res) => {
  const booking = bookings[req.params.id];
  if (!booking) return res.status(404).json({ error: 'Not found' });
  res.json(booking);
});

// POST /api/bookings/:id/respond - Therapist Accept/Decline
app.post('/api/bookings/:id/respond', async (req, res) => {
  const { action } = req.body; // 'accept' or 'decline'
  const booking = bookings[req.params.id];
  if (!booking) return res.status(404).json({ error: 'Not found' });
  if (action === 'accept') {
    booking.status = 'accepted';
    // Send confirmation email to customer
    await sendEmail({
      to: booking.customerEmail,
      subject: 'Booking Confirmed',
      html: `<h2>Your booking is confirmed!</h2><p>Your therapist will contact you soon.</p>`
    });
    res.json({ status: 'accepted' });
  } else if (action === 'decline') {
    // Move to next therapist or mark as declined
    booking.therapistIndex++;
    if (booking.therapistIndex < booking.therapists.length) {
      const nextTherapist = booking.therapists[booking.therapistIndex];
      await sendEmail({
        to: nextTherapist.email,
        subject: 'New Booking Request',
        html: `<h2>New Booking for ${nextTherapist.name}</h2><p>Click <a href="${process.env.FRONTEND_URL}/therapist-response?id=${booking.id}&action=accept">Accept</a> or <a href="${process.env.FRONTEND_URL}/therapist-response?id=${booking.id}&action=decline">Decline</a></p>`
      });
      res.json({ status: 'next_therapist' });
    } else {
      booking.status = 'declined';
      // Optionally notify customer
      res.json({ status: 'declined' });
    }
  } else {
    res.status(400).json({ error: 'Invalid action' });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  WARNING: GOOGLE_API_KEY environment variable not set!');
    console.warn('   Create a .env file with your Google API key to enable Maps functionality.');
  } else {
    console.log('✅ Google API key loaded successfully');
  }
});

module.exports = app; 