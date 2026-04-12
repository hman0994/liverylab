window.FillToolController = class FillToolController {
  constructor(context) {
    this.context = context;
  }

  activate() {}

  deactivate() {}

  pointerDown(point) {
    if (!point) return;

    this.context.fill.commitAt(point);
  }

  pointerMove() {}

  pointerUp() {}
};