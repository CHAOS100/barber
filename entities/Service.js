{
  "name": "Service",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "price": {
      "type": "number"
    },
    "duration": {
      "type": "number"
    },
    "image_url": {
      "type": "string"
    },
    "is_active": {
      "type": "boolean",
      "default": true
    },
    "category": {
      "type": "string"
    },
    "sort_order": {
      "type": "number",
      "default": 0
    }
  },
  "required": [
    "name",
    "price",
    "duration"
  ]
}