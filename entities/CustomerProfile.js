{
  "name": "CustomerProfile",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "phone": {
      "type": "string"
    },
    "reward_points": {
      "type": "number",
      "default": 0
    },
    "warning_count": {
      "type": "number",
      "default": 0
    },
    "is_blocked": {
      "type": "boolean",
      "default": false
    },
    "favorite_services": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "notes": {
      "type": "string"
    },
    "total_appointments": {
      "type": "number",
      "default": 0
    }
  },
  "required": [
    "name",
    "phone"
  ]
}