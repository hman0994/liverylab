window.TextToolController = class TextToolController {
  constructor(context) {
    this.context = context;
  }

  activate() {}

  deactivate() {}

  pointerDown(point) {
    if (!point) return;

    this.context.text.insertAt(point);
  }

  pointerMove() {}

  pointerUp() {}
};