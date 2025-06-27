# Rejuvenators Mobile Massage Booking System

A secure booking system for mobile massage services with therapist assignment and payment processing.

## Security Features

- Google Maps API key is securely stored in environment variables
- API keys are never exposed in frontend code
- Secure server-side API key management

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory with your API keys:

```bash
# Copy the example file
cp env.example .env

# Edit .env with your actual API keys
```

Add your actual API keys to the `.env` file:

```
GOOGLE_API_KEY=your_actual_google_api_key_here
EMAILJS_PUBLIC_KEY=your_actual_emailjs_public_key_here
EMAILJS_SERVICE_ID=your_actual_emailjs_service_id_here
EMAILJS_TEMPLATE_ID=your_actual_emailjs_template_id_here
STRIPE_PUBLISHABLE_KEY=your_actual_stripe_publishable_key_here
```

### 3. Start the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The application will be available at `http://localhost:3000`

## Security Notes

- Never commit your `.env` file to version control
- The `.gitignore` file is configured to exclude sensitive files
- API keys are loaded server-side and served securely to the frontend
- Google Maps API is loaded dynamically with the secure key

## Features

- Multi-step booking form
- Google Places autocomplete for addresses
- Real-time price calculation
- Therapist assignment with email notifications
- Stripe payment processing
- EmailJS integration for notifications
- Responsive design

## API Keys Required

1. **Google Maps API Key**: For address autocomplete and geolocation
2. **EmailJS Keys**: For email notifications to therapists and customers
3. **Stripe Publishable Key**: For payment processing

## Development

- The server runs on Express.js
- Frontend uses vanilla JavaScript
- Static files are served from the root directory
- API endpoints are prefixed with `/api/` 