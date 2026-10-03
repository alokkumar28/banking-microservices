import notificationService from "../services/notification.service.js";

import {
  sendNotificationSchema,
  notificationIdSchema,
  notificationQuerySchema,
  updatePreferencesSchema,
} from "../middleware/validations.js";

// INTERNAL: SEND NOTIFICATION
const sendNotification = async (req, res) => {
  try {
    const { error, value } = sendNotificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const result = await notificationService.sendCustomNotification(value);
    return res.status(201).json({
      success: true,
      message: "Notification processed successfully",
      data: result,
    });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to send notification",
      message: error.message,
    });
  }
};

// INTERNAL: GET NOTIFICATION
const getNotificationById = async (req, res) => {
  try {
    const { error, value } = notificationIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID",
        details: error.details.map((detail) => detail.message),
      });
    }

    const notification = await notificationService.getNotificationById(
      value.id,
    );

    return res.status(200).json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: error.message || "Notification not found",
    });
  }
};

// INTERNAL: LIST
const listNotifications = async (req, res) => {
  try {
    const { error, value } = notificationQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }

    const result = await notificationService.listNotifications(value);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("List notifications error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to list notifications",
    });
  }
};

// USER: MY NOTIFICATIONS
const getMyNotifications = async (req, res) => {
  try {
    const { error, value } = notificationQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    value.userId = req.user.userId;
    const result = await notificationService.listNotifications(value);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get my notifications error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get notifications",
    });
  }
};

// USER: GET MY NOTIFICATION BY ID
const getMyNotificationById = async (req, res) => {
  try {
    const { error, value } = notificationIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID",
      });
    }
    const notification = await notificationService.getUserNotificationById(
      value.id,
      req.user.userId,
    );

    return res.status(200).json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: error.message || "Notification not found",
    });
  }
};

// USER: MARK READ
const markNotificationAsRead = async (req, res) => {
  try {
    const { error, value } = notificationIdSchema.validate(req.params);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid notification ID",
      });
    }
    const notification = await notificationService.markAsRead(
      value.id,
      req.user.userId,
    );
    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: {
        notification,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      error: error.message || "Notification not found",
    });
  }
};

// USER: GET PREFERENCES
const getMyPreferences = async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(
      req.user.userId,
    );
    return res.status(200).json({
      success: true,
      data: {
        preferences,
      },
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get notification preferences",
    });
  }
};

// USER: UPDATE PREFERENCES
const updateMyPreferences = async (req, res) => {
  try {
    const { error, value } = updatePreferencesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((detail) => detail.message),
      });
    }
    const preferences = await notificationService.updateUserPreferences(
      req.user.userId,
      value,
    );

    return res.status(200).json({
      success: true,
      message: "Notification preferences updated",
      data: {
        preferences,
      },
    });
  } catch (error) {
    console.error("Update preferences error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to update notification preferences",
      message: error.message,
    });
  }
};

export {
  sendNotification,
  getNotificationById,
  listNotifications,
  getMyNotifications,
  getMyNotificationById,
  markNotificationAsRead,
  getMyPreferences,
  updateMyPreferences,
};
