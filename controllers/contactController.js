const nodemailer = require('nodemailer');
const path = require('path');

exports.sendContactEmail = async (req, res) => {
  try {
    const { name, email, service, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and message.' });
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.warn('Contact Form: SMTP configuration is incomplete.');
      return res.status(500).json({ success: false, message: 'Email service is not configured on the server' });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE ? SMTP_SECURE === 'true' : Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_FROM || process.env.SMTP_USER, // Send to admin
      subject: `New Contact Form Submission: ${service || 'General Inquiry'}`,
      text: `You have received a new message from the SocialSwap Contact Form.\n\nName: ${name}\nEmail: ${email}\nService Interested: ${service || 'N/A'}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:logo" alt="SocialSwap" style="max-height: 60px; margin-bottom: 10px;" />
            <p style="color: #666; margin-top: 5px; font-size: 14px;">The Ultimate Marketplace for Channels</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #333; margin-top: 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">New Contact Inquiry</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; width: 30%; color: #666; font-weight: bold;">Name:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-weight: bold;">Email:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;"><a href="mailto:${email}" style="color: #6d28d9; text-decoration: none;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #666; font-weight: bold;">Service:</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #333;">
                  <span style="background-color: #ede9fe; color: #6d28d9; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                    ${service || 'General Inquiry'}
                  </span>
                </td>
              </tr>
            </table>

            <div style="margin-top: 25px;">
              <p style="color: #666; font-weight: bold; margin-bottom: 10px;">Message:</p>
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #6d28d9; color: #444; line-height: 1.6;">
                ${message.replace(/\\n/g, '<br>')}
              </div>
            </div>
          </div>

          <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
            <p>This email was sent automatically from the <a href="https://www.socialswap.com" style="color: #6d28d9; text-decoration: none; font-weight: bold;">SocialSwap</a> Contact Form.</p>
            <p>Visit <a href="https://www.socialswap.com" style="color: #6d28d9; text-decoration: none;">www.socialswap.com</a> for more information.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../logo.png'),
        cid: 'logo'
      }]
    };

    await transporter.sendMail(mailOptions);

    // Send a professional "Thank you" auto-reply to the user
    const userMailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email, // Send to the user who submitted the form
      subject: `Thank you for contacting SocialSwap!`,
      text: `Hi ${name},\n\nThank you for reaching out to us. We have received your request for: ${service || 'General Inquiry'}.\n\nOur team will get back to you within 24 hours.\n\nBest regards,\nThe SocialSwap Team`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:logo" alt="SocialSwap" style="max-height: 60px; margin-bottom: 10px;" />
            <p style="color: #666; margin-top: 5px; font-size: 14px;">The Ultimate Marketplace for Channels</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h2 style="color: #333; margin-top: 0; margin-bottom: 20px; font-size: 22px;">Hi ${name},</h2>
            <p style="color: #555; line-height: 1.6; font-size: 16px;">
              Thank you for reaching out to us! We have received your request regarding <strong style="color: #6d28d9;">${service || 'General Inquiry'}</strong>.
            </p>
            <p style="color: #555; line-height: 1.6; font-size: 16px;">
              Our expert team is reviewing your message and will get back to you within 24 hours with a personalized response.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #f0f0f0;">
              <p style="color: #555; line-height: 1.6; font-size: 16px; margin: 0;">
                Best regards,<br>
                <strong>The SocialSwap Team</strong>
              </p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
            <p>Visit <a href="https://www.socialswap.com" style="color: #6d28d9; text-decoration: none; font-weight: bold;">www.socialswap.com</a> to explore our latest channels.</p>
            <p>&copy; ${new Date().getFullYear()} SocialSwap. All rights reserved.</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: 'logo.png',
        path: path.join(__dirname, '../logo.png'),
        cid: 'logo'
      }]
    };

    await transporter.sendMail(userMailOptions);

    res.status(200).json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error sending contact email:', error);
    res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
  }
};
