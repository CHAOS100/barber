{
  "name": "BlockedDate",
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "format": "date"
    },
    "reason": {
      "type": "string"
    },
    "is_full_day": {
      "type": "boolean",
      "default": true
    },
    "blocked_times": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "date"
  ]
}