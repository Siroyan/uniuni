mod model;

use model::{apply_command, run_drc, Command, ProjectState};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn create_empty_project_json() -> Result<String, JsValue> {
    serde_json::to_string(&ProjectState::default())
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen]
pub fn apply_command_json(state_json: &str, cmd_json: &str) -> Result<String, JsValue> {
    let mut state: ProjectState = serde_json::from_str(state_json)
        .map_err(|err| JsValue::from_str(&format!("invalid state json: {err}")))?;
    let cmd: Command = serde_json::from_str(cmd_json)
        .map_err(|err| JsValue::from_str(&format!("invalid command json: {err}")))?;

    apply_command(&mut state, cmd).map_err(|err| JsValue::from_str(&err))?;

    serde_json::to_string(&state)
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen]
pub fn drc_json(state_json: &str) -> Result<String, JsValue> {
    let state: ProjectState = serde_json::from_str(state_json)
        .map_err(|err| JsValue::from_str(&format!("invalid state json: {err}")))?;
    let issues = run_drc(&state);
    serde_json::to_string(&issues)
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}
