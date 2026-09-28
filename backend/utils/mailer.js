const nodemailer = require('nodemailer');

/**
 * Sends transactional email via SMTP (local dev) or HTTP API (production/Render).
 * HTTP API is used in production to bypass outbound SMTP port blocking on Render.
 */
const sendMail = async ({ to, subject, html, text }) => {
  const isDev = (process.env.NODE_ENV || 'development').trim() === 'development';
  const isProduction = !isDev;

  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  
  // Resolve default from email
  let fromEmail = process.env.SMTP_FROM || user;
  if (host.includes('resend.com') && !process.env.SMTP_FROM) {
    fromEmail = 'onboarding@resend.dev';
  }

  // Debug API Key properties safely in production
  if (isProduction) {
    console.log(`[mailer] DEBUG: SMTP_PASS length is ${pass.length} | Starts with: ${pass.substring(0, 12)}... | Ends with: ...${pass.substring(pass.length - 12)}`);
  }

  // ------------------------------------------------------------------
  // 1. PRODUCTION HTTP API ROUTE (Bypasses SMTP port blocks on Render)
  // ------------------------------------------------------------------
  if (isProduction) {
    console.log(`[mailer] Production: dispatching via HTTP API to bypass SMTP restrictions...`);

    // A. BREVO HTTP API
    if (host.includes('brevo.com')) {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': pass, // Brevo API key is the SMTP password
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'CodeGuru', email: fromEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });

      if (!response.ok) {
        const errorDetails = await response.json();
        throw new Error(`Brevo HTTP API Error: ${response.status} - ${JSON.stringify(errorDetails)}`);
      }

      const data = await response.json();
      console.log(`[mailer] Email sent successfully via Brevo HTTP API: ${data.messageId}`);
      return { success: true, messageId: data.messageId };
    }

    // B. RESEND HTTP API
    if (host.includes('resend.com')) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pass}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `CodeGuru <${fromEmail}>`,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (!response.ok) {
        const errorDetails = await response.json();
        throw new Error(`Resend HTTP API Error: ${response.status} - ${JSON.stringify(errorDetails)}`);
      }

      const data = await response.json();
      console.log(`[mailer] Email sent successfully via Resend HTTP API: ${data.id}`);
      return { success: true, messageId: data.id };
    }
  }

  // ------------------------------------------------------------------
  // 2. LOCAL DEV / FALLBACK ROUTE (Standard SMTP logic)
  // ------------------------------------------------------------------
  const isSmtpConfigured = host && user && pass;
  if (!isSmtpConfigured) {
    if (isDev) {
      console.log('\n==================================================');
      console.log(`✉️  [DEV MAIL FALLBACK]`);
      console.log(`To:      ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:    ${text || 'HTML content (see below)'}`);
      if (html) {
        console.log(`--------------------------------------------------`);
        console.log(html);
      }
      console.log('==================================================\n');

      // Write code to a local file for automated verification/testing
      try {
        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, '../otp_log.txt'), text || '');
      } catch (err) {
        console.error('Failed to write local otp_log.txt:', err);
      }

      return { success: true, message: 'Logged to console' };
    } else {
      throw new Error('SMTP configuration (SMTP_HOST, SMTP_USER, SMTP_PASS) is missing in production!');
    }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for other ports (like 587)
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: `"CodeGuru" <${fromEmail}>`,
    to,
    subject,
    text,
    html,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[mailer] Email sent successfully via SMTP: ${info.messageId}`);
  return { success: true, messageId: info.messageId };
};

module.exports = { sendMail };
