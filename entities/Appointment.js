{
  "name": "Appointment",
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
    "service_id": {
      "type": "string"
    },
    "service_name": {
      "type": "string"
    },
    "service_price": {
      "type": "number"
    },
    "service_duration": {
      "type": "number"
    },
    "date": {
      "type": "string",
      "format": "date"
    },
    "time": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show"
      ],
      "default": "pending"
    },
    "notes": {
      "type": "string"
    },
    "is_recurring": {
      "type": "boolean",
      "default": false
    },
    "admin_notes": {
      "type": "string"
    }
  },
  "required": [
    "customer_name",
    "customer_phone",
    "service_name",
    "date",
    "time"
  ]
}