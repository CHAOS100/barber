{
  "name": "WorkingHours",
  "type": "object",
  "properties": {
    "day_of_week": {
      "type": "number"
    },
    "day_name": {
      "type": "string"
    },
    "is_open": {
      "type": "boolean",
      "default": true
    },
    "open_time": {
      "type": "string"
    },
    "close_time": {
      "type": "string"
    },
    "breaks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "start": {
            "type": "string"
          },
          "end": {
            "type": "string"
          },
          "label": {
            "type": "string"
          }
        }
      }
    }
  },
  "required": [
    "day_of_week",
    "day_name"
  ]
}