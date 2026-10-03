import nodemailer from "nodemailer";
import config from "../config/config.js";
import { stripHtml } from "../utils/helpers.js";

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: config.email.user
        ? {
            user: config.email.user,
            pass: config.email.password,
          }
        : undefined,

      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log("Email service is ready.");
      return true;
    } catch (error) {
      console.warn("Email service is not ready:", error.message);
      return false;
    }
  }

  async sendEmail({ to, subject, html, text }) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${config.email.from.name}" <${config.email.from.email}>`,
        to,
        subject,
        html,
        text: text || stripHtml(html),
      });

      console.log(`Email sent to ${to}`);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error("Email sending failed:", error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default new EmailService();
