# TechPro Premium - Gaming Hardware Guide

A full-stack web application featuring the TechPro Gaming Hardware Guide with Stripe payments integration and Supabase authentication.

## Features

- 🎮 **Complete Gaming Hardware Guide** - Breadboarding method, Eco-Pro undervolting, Q-LED diagnostics, maintenance calendar
- 💳 **Stripe Payment Integration** - Secure checkout with subscription management
- 🔐 **Supabase Authentication** - User registration, login, and premium access tracking
- 📱 **Responsive Design** - Mobile-first design with dark theme
- ⚡ **Vercel Edge Functions** - Serverless API endpoints for checkout and webhooks
- 🎨 **Modern UI** - Cyan and navy theme with smooth transitions

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Vercel Functions (Node.js)
- **Payments**: Stripe (Checkout & Webhooks)
- **Authentication**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **Hosting**: Vercel

## Project Structure
techpro-premium/ ├── api/ │ ├── create-checkout-session.js # Stripe checkout session handler │ └── stripe-webhook.ts # Stripe webhook event processor ├── index.html # Main application with guide content ├── style.css # Global styles ├── package.json # Project dependencies ├── vercel.json # Vercel deployment configuration └── README.md # Project documentation

## Quick Start

### Prerequisites

- Node.js 18+
- Vercel CLI (`npm install -g vercel`)
- Stripe Account (free)
- Supabase Account (free)

### Environment Variables

Create a `.env.local` file with:
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... VITE_SUPABASE_URL=https://your-project.supabase.co VITE_SUPABASE_ANON_KEY=eyJhbGc...

### Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/techpro-premium.git
cd techpro-premium

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000 in your browser
Deployment
Deploy to Vercel
Push your code to GitHub
Go to vercel.com and create new project
Import your GitHub repository
Add environment variables in Vercel project settings:
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
Deploy with:
vercel --prod
Configure Stripe Webhook
Go to Stripe Dashboard
Click "Add endpoint"
Enter your webhook URL: https://yourdomain.vercel.app/api/stripe-webhook
Select events:
checkout.session.completed
customer.subscription.deleted
invoice.payment_failed
Copy the signing secret
Add to Vercel as STRIPE_WEBHOOK_SECRET
Setup Supabase Database
Create project at supabase.com
Go to SQL Editor
Run this query:
CREATE TABLE user_access (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  is_premium_subscriber BOOLEAN DEFAULT false,
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  premium_activated_at TIMESTAMP WITH TIME ZONE,
  premium_cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
Enable Row Level Security (RLS) on the table
Create policies for users to view their own data
Pricing Plans


Plan	Price	Features
Free	£0/mo	Standard Support, Basic Access
Premium	£29/mo	24/7 Priority Support, Full Content Library, Early Features, Complete Hardware Guide
Features Overview
TechPro Gaming Hardware Guide
The complete guide includes 8 comprehensive sections:

Introduction & The TechPro Difference - Four core pillars of PC building excellence
Hardware Recommendations - High-end build tier optimized for 1440p–4K gaming
Build Configuration - The Breadboarding Method for safe, DOA-free assembly
Eco-Pro Undervolting - Advanced performance optimization techniques
Q-LED Diagnostic Matrix - Professional troubleshooting and error identification
TechPro Maintenance Calendar - Long-term PC care and performance sustainability
Premium Access & Customer Welcome - Welcome email template for new subscribers
Web Styling Reference - Complete CSS framework for Bolt integration
Payment Flow
User clicks "Upgrade to TechPro Premium"
Stripe checkout session is created
User completes payment in Stripe Checkout
Webhook confirms payment
User's premium status updated in Supabase
Premium content unlocked immediately
API Endpoints
POST /api/create-checkout-session
Creates a Stripe checkout session for TechPro Premium upgrade.

Request:

{
  "email": "user@example.com",
  "userId": "user-id-from-supabase"
}
Response:

{
  "url": "https://checkout.stripe.com/pay/...",
  "sessionId": "cs_test_..."
}
POST /api/stripe-webhook
Handles Stripe webhook events for payment confirmation and subscription management.

Events Handled:

checkout.session.completed - Grants premium access
customer.subscription.deleted - Revokes premium access
invoice.payment_failed - Logs payment failure
Testing
Test Cards (Stripe)
In test mode, use these card numbers:

Successful Payment: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Expired Card: 4000 0000 0000 0069
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
Test Webhooks Locally
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Listen for webhooks
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Copy the webhook signing secret
Troubleshooting


Issue	Solution
Checkout button not working	Verify env variables are set correctly, check browser console (F12) for errors
Webhook not processing payments	Check Stripe Dashboard for webhook delivery status, verify signing secret matches
Premium access not updating	Check Supabase user_access table, verify RLS policies, review Vercel function logs
404 errors on navigation	Verify all section IDs match href links, test in incognito mode
Cold start delays	Normal for serverless functions, adds ~1-2 seconds on first request
Available Scripts
npm run dev      # Start development server with hot reload
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint for code quality
npm run format   # Format code with Prettier
Performance & Security
Performance:

Fast static site hosted on Vercel's global CDN
Serverless functions with minimal cold start
Optimized CSS and minimal JavaScript
Mobile-responsive dark theme
Security:

Stripe API keys stored as Vercel secrets (never in code)
Webhook signature verification enabled
Supabase row-level security configured
HTTPS enforced on all connections
JWT token validation on API endpoints
Database Schema
user_access Table


Column	Type	Description
user_id	UUID	User ID from Supabase Auth (primary key)
is_premium_subscriber	BOOLEAN	Premium subscription status
stripe_customer_id	TEXT	Stripe customer ID
stripe_session_id	TEXT	Latest checkout session ID
premium_activated_at	TIMESTAMP	When premium was activated
premium_cancelled_at	TIMESTAMP	When premium was cancelled
created_at	TIMESTAMP	Record creation time
updated_at	TIMESTAMP	Last update time
Support & Resources
GitHub Issues: Create Issue
Email Support: support@techpro.example.com
Stripe Documentation: stripe.com/docs
Supabase Documentation: supabase.com/docs
Vercel Documentation: vercel.com/docs
License
MIT License - See LICENSE file for details

Changelog
v1.0.0 - Initial Release
Complete TechPro Gaming Hardware Guide (8 comprehensive sections)
Stripe Checkout integration with subscription support
Supabase authentication and database integration
Webhook event processing and user status management
Responsive design with dark theme (navy & cyan)
Vercel Functions for serverless backend
Production-ready deployment configuration
Built with ❤️ using Vercel, Stripe & Supabase

Last Updated: January 2026

Ask a question...
