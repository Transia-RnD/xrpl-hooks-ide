import toast from "react-hot-toast";
import state from '../index';

// Saves the current editor content to global state
export const saveFile = (showToast: boolean = true) => {
  const editorModels = state.editorCtx?.getModels();
  const currentModel = editorModels?.find((editorModel) => {
    return editorModel.uri.path === `/c/${state.files[state.active].name}`;
  });
  if (state.files.length > 0) {
    state.files[state.active].content = currentModel?.getValue() || "";
  }
  if (showToast) {
    toast.success("Saved successfully", { position: "bottom-center" });
  }
};