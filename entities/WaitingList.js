{
  "name": "WaitingList",
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
    "date": {
      "type": "string"
    },
    "time": {
      "type": "string"
    },
    "service_name": {
      "type": "string"
    },
    "notified_at": {
      "type": "string"
    },
    "is_claimed": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "customer_name",
    "customer_phone",
    "date",
    "service_name"
  ]
}