import config from "../config/config.js";

class SmsService {
  constructor() {
    this.provider = config.sms.provider;
    console.log(`SMS provider: ${this.provider}`);
  }
  async sendSms({ to, message }) {
    try {
      if (this.provider === "mock") {
        console.log("=================================");
        console.log("[MOCK SMS]");
        console.log(`To: ${to}`);
        console.log(`Message: ${message}`);
        console.log("=================================");
        return {
          success: true,
          providerId: `mock-sms-${Date.now()}`,
          response: "MOCK_SENT",
        };
      }
      throw new Error(`Unsupported SMS provider: ${this.provider}`);
    } catch (error) {
      console.error("SMS sending failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default new SmsService();
