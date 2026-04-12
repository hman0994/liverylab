window.FreeDrawToolController = class FreeDrawToolController {
  constructor(toolName, context) {
    this.toolName = toolName;
    this.context = context;
  }

  activate() {
    this.context.freeDraw.activate(this.toolName);
  }

  deactivate() {
    this.context.freeDraw.deactivate(this.toolName);
  }

  pointerDown() {
    this.context.freeDraw.begin(this.toolName);
  }

  pointerMove() {}

  pointerUp() {
    this.context.freeDraw.end(this.toolName);
  }

  pathCreated(path) {
    return this.context.freeDraw.commitPath(this.toolName, path);
  }
};