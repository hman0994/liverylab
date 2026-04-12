window.SelectToolController = class SelectToolController {
  constructor(context) {
    this.context = context;
  }

  activate() {
    this.context.select.activateMode();
  }

  deactivate() {}

  pointerDown(pointer) {
    this.context.select.handlePointerDown(pointer?.target);
  }

  pointerMove() {}

  pointerUp() {
    this.context.select.handlePointerUp();
  }
};
