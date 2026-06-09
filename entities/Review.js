{
  "name": "Review",
  "type": "object",
  "properties": {
    "customer_name": {
      "type": "string"
    },
    "customer_phone": {
      "type": "string"
    },
    "customer_id": {
      "type": "string"
    },
    "rating": {
      "type": "number"
    },
    "comment": {
      "type": "string"
    },
    "photo_url": {
      "type": "string"
    },
    "admin_reply": {
      "type": "string"
    },
    "is_pinned": {
      "type": "boolean",
      "default": false
    },
    "is_hidden": {
      "type": "boolean",
      "default": false
    },
    "service_name": {
      "type": "string"
    }
  },
  "required": [
    "customer_name",
    "rating"
  ]
}