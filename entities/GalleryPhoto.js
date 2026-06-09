{
  "name": "GalleryPhoto",
  "type": "object",
  "properties": {
    "url": {
      "type": "string"
    },
    "category": {
      "type": "string",
      "enum": [
        "haircuts",
        "skin_fades",
        "beard",
        "before_after",
        "premium_styles"
      ],
      "default": "haircuts"
    },
    "is_featured": {
      "type": "boolean",
      "default": false
    },
    "is_hidden": {
      "type": "boolean",
      "default": false
    },
    "sort_order": {
      "type": "number",
      "default": 0
    },
    "caption": {
      "type": "string"
    }
  },
  "required": [
    "url",
    "category"
  ]
}