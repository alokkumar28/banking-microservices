import { Kafka } from "kafkajs";
import config from "../config/config.js";
import notificationService from "../services/notification.service.js";

class EventConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: [config.kafka.broker],
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: config.kafka.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      return;
    }
    try {
      await this.consumer.connect();
      console.log("Kafka consumer connected.");
      const topics = [
        config.kafka.topics.authEvents,
        config.kafka.topics.userEvents,
        config.kafka.topics.accountEvents,
        config.kafka.topics.transactionEvents,
      ];

      for (const topic of topics) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: false,
        });
        console.log(`Subscribed to Kafka topic: ${topic}`);
      }

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          await this.handleMessage(topic, partition, message);
        },
      });
      this.isRunning = true;
      console.log("Kafka consumer is running.");
    } catch (error) {
      console.error("Kafka consumer startup failed:", error);

      throw error;
    }
  }

  async handleMessage(topic, partition, message) {
    try {
      if (!message.value) {
        console.warn("Received Kafka message without value.");
        return;
      }

      const rawValue = message.value.toString();
      const payload = JSON.parse(rawValue);
      const eventId = payload.eventId || payload.event_id;
      const eventType = payload.eventType || payload.event_type;

      if (!eventId) {
        throw new Error("Kafka event missing eventId");
      }

      if (!eventType) {
        throw new Error("Kafka event missing eventType");
      }

      console.log("=================================");
      console.log("Kafka event received");
      console.log(`Topic: ${topic}`);
      console.log(`Partition: ${partition}`);
      console.log(`Event ID: ${eventId}`);
      console.log(`Event Type: ${eventType}`);
      console.log("=================================");

      await notificationService.processEvent(
        eventType,
        payload,
        topic,
        eventId,
      );
    } catch (error) {
      console.error(
        `Failed to process Kafka message from ${topic}:`,
        error.message,
      );
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    try {
      await this.consumer.disconnect();
      this.isRunning = false;
      console.log("Kafka consumer stopped.");
    } catch (error) {
      console.error("Failed to stop Kafka consumer:", error);
    }
  }
}

export default new EventConsumer();
