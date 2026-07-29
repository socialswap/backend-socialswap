const nodemailer = require('nodemailer');
const path = require('path');

const transporter = (() => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('Mailer: SMTP configuration is incomplete. Emails cannot be sent until all SMTP environment variables are set.');
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE ? SMTP_SECURE === 'true' : Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
})();

// Helper function to send emails with the logo attached
const sendMailWithLogo = async (to, subject, htmlContent) => {
  if (!transporter) {
    console.warn('Mailer not configured. Skipping email to:', to);
    return false;
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html: htmlContent,
      attachments: [
        {
          filename: 'logo.webp',
          path: path.join(__dirname, '../logo.webp'),
          cid: 'socialswap-logo', // same cid value as in the html img src
          contentDisposition: 'inline',
          contentType: 'image/webp'
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Failed to send email to', to, error);
    return false;
  }
};

module.exports = { transporter, sendMailWithLogo };
