{
  "name": "Notification",
  "type": "object",
  "properties": {
    "user_phone": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": [
        "booking_confirmed",
        "booking_cancelled",
        "booking_reminder",
        "waiting_list",
        "review_reply",
        "warning",
        "general"
      ],
      "default": "general"
    },
    "title": {
      "type": "string"
    },
    "message": {
      "type": "string"
    },
    "is_read": {
      "type": "boolean",
      "default": false
    },
    "related_id": {
      "type": "string"
    }
  },
  "required": [
    "title",
    "message",
    "type"
  ]
}