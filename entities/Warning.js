{
  "name": "Warning",
  "type": "object",
  "properties": {
    "customer_id": {
      "type": "string"
    },
    "customer_name": {
      "type": "string"
    },
    "customer_phone": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": [
        "late_cancel",
        "no_show",
        "late_arrival",
        "manual"
      ],
      "default": "manual"
    },
    "date": {
      "type": "string"
    },
    "notes": {
      "type": "string"
    },
    "appointment_id": {
      "type": "string"
    }
  },
  "required": [
    "customer_name",
    "type",
    "date"
  ]
}