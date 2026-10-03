import config from "../config/config.js";

class PushService {
  constructor() {
    this.provider = config.push.provider;
    console.log(`Push provider: ${this.provider}`);
  }

  async sendPush({ token, title, body, data }) {
    try {
      if (this.provider === "mock") {
        console.log("=================================");
        console.log("[MOCK PUSH]");
        console.log(`Token: ${token}`);
        console.log(`Title: ${title}`);
        console.log(`Body: ${body}`);
        console.log("Data:", data || {});
        console.log("=================================");
        return {
          success: true,
          providerId: `mock-push-${Date.now()}`,
          response: "MOCK_SENT",
        };
      }
      throw new Error(`Unsupported Push provider: ${this.provider}`);
    } catch (error) {
      console.error("Push sending failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default new PushService();
