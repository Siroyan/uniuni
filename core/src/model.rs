use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct GridPt {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub grid_pitch_mm: f32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wire {
    pub id: Uuid,
    pub net_id: Uuid,
    pub path: Vec<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Net {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartDef {
    pub id: Uuid,
    pub name: String,
    pub pins: Vec<PinDef>,
    pub occupied: Vec<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinDef {
    pub name: String,
    pub pos: GridPt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartInst {
    pub id: Uuid,
    pub def_id: Uuid,
    pub at: GridPt,
    pub rot: Rot,
    pub refdes: String,
    pub net_assign: HashMap<String, Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Rot {
    Deg0,
    Deg90,
    Deg180,
    Deg270,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub schema_version: u32,
    pub board: Board,
    pub part_defs: Vec<PartDef>,
    pub part_insts: Vec<PartInst>,
    pub nets: Vec<Net>,
    pub wires: Vec<Wire>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            board: Board {
                grid_pitch_mm: 2.54,
                width: 64,
                height: 40,
            },
            part_defs: Vec::new(),
            part_insts: Vec::new(),
            nets: Vec::new(),
            wires: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Command {
    CommitWire { net_id: Uuid, path: Vec<GridPt> },
    AssignNetName { net_id: Uuid, name: String },
    AddPartInst {
        def_id: Uuid,
        at: GridPt,
        rot: Rot,
        refdes: String,
    },
    MovePartInst {
        part_id: Uuid,
        to: GridPt,
    },
    RotatePartInst {
        part_id: Uuid,
        rot: Rot,
    },
    DeletePartInst {
        part_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrcIssue {
    pub level: IssueLevel,
    pub code: String,
    pub message: String,
    pub at: Option<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IssueLevel {
    Error,
    Warning,
}

pub fn apply_command(state: &mut ProjectState, cmd: Command) -> Result<(), String> {
    match cmd {
        Command::AddPartInst {
            def_id,
            at,
            rot,
            refdes,
        } => {
            let Some(part_def) = state.part_defs.iter().find(|def| def.id == def_id) else {
                return Err("part definition not found".to_owned());
            };

            let new_id = Uuid::new_v4();
            validate_part_placement(state, part_def, new_id, at, rot)?;

            state.part_insts.push(PartInst {
                id: new_id,
                def_id,
                at,
                rot,
                refdes,
                net_assign: HashMap::new(),
            });
            Ok(())
        }
        Command::MovePartInst { part_id, to } => {
            let Some(index) = state.part_insts.iter().position(|part| part.id == part_id) else {
                return Err("part instance not found".to_owned());
            };
            let part = state.part_insts[index].clone();
            let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
                return Err("part definition not found".to_owned());
            };
            validate_part_placement(state, part_def, part.id, to, part.rot)?;
            state.part_insts[index].at = to;
            Ok(())
        }
        Command::RotatePartInst { part_id, rot } => {
            let Some(index) = state.part_insts.iter().position(|part| part.id == part_id) else {
                return Err("part instance not found".to_owned());
            };
            let part = state.part_insts[index].clone();
            let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
                return Err("part definition not found".to_owned());
            };
            validate_part_placement(state, part_def, part.id, part.at, rot)?;
            state.part_insts[index].rot = rot;
            Ok(())
        }
        Command::DeletePartInst { part_id } => {
            let before = state.part_insts.len();
            state.part_insts.retain(|part| part.id != part_id);
            if state.part_insts.len() == before {
                return Err("part instance not found".to_owned());
            }
            Ok(())
        }
        Command::CommitWire { net_id, path } => {
            validate_wire_path(&path)?;
            state.wires.push(Wire {
                id: Uuid::new_v4(),
                net_id,
                path,
            });
            Ok(())
        }
        Command::AssignNetName { net_id, name } => {
            if let Some(net) = state.nets.iter_mut().find(|n| n.id == net_id) {
                net.name = name;
                return Ok(());
            }
            Err("net not found".to_owned())
        }
    }
}

pub fn rebuild_part_occupancy_map(state: &ProjectState) -> Result<HashMap<GridPt, Uuid>, String> {
    let mut occ_map: HashMap<GridPt, Uuid> = HashMap::new();

    for part in &state.part_insts {
        let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
            return Err("part definition not found".to_owned());
        };
        for occ in absolute_occupied_points(part_def, part.at, part.rot) {
            if !is_inside_board(&state.board, occ) {
                return Err("part occupancy outside board".to_owned());
            }
            if occ_map.insert(occ, part.id).is_some() {
                return Err("part-part occupancy collision".to_owned());
            }
        }
    }

    Ok(occ_map)
}

pub fn validate_wire_path(path: &[GridPt]) -> Result<(), String> {
    if path.len() < 2 {
        return Err("wire path must have >=2 points".to_owned());
    }

    for window in path.windows(2) {
        let a = window[0];
        let b = window[1];
        let dx = (a.x - b.x).abs();
        let dy = (a.y - b.y).abs();
        if dx + dy != 1 {
            return Err("wire segments must be one-grid-step Manhattan".to_owned());
        }
    }

    Ok(())
}

pub fn run_drc(state: &ProjectState) -> Vec<DrcIssue> {
    let mut issues = Vec::new();
    let mut occ_wire: HashMap<GridPt, HashSet<Uuid>> = HashMap::new();

    if let Err(err) = rebuild_part_occupancy_map(state) {
        issues.push(DrcIssue {
            level: IssueLevel::Error,
            code: "PART_COLLISION".to_owned(),
            message: err,
            at: None,
        });
    }

    for wire in &state.wires {
        for pt in &wire.path {
            occ_wire.entry(*pt).or_default().insert(wire.net_id);
        }
    }

    for (pt, nets) in occ_wire {
        if nets.len() > 1 {
            issues.push(DrcIssue {
                level: IssueLevel::Error,
                code: "SHORT".to_owned(),
                message: "multiple nets share one grid point".to_owned(),
                at: Some(pt),
            });
        }
    }

    issues
}

fn validate_part_placement(
    state: &ProjectState,
    part_def: &PartDef,
    self_id: Uuid,
    at: GridPt,
    rot: Rot,
) -> Result<(), String> {
    for occ in absolute_occupied_points(part_def, at, rot) {
        if !is_inside_board(&state.board, occ) {
            return Err("part placement is outside board".to_owned());
        }
        if part_collision_at(state, self_id, occ) {
            return Err("part placement collides with another part".to_owned());
        }
    }
    Ok(())
}

fn part_collision_at(state: &ProjectState, self_id: Uuid, pt: GridPt) -> bool {
    state.part_insts.iter().any(|part| {
        if part.id == self_id {
            return false;
        }
        let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
            return false;
        };
        absolute_occupied_points(part_def, part.at, part.rot).contains(&pt)
    })
}

fn absolute_occupied_points(part_def: &PartDef, at: GridPt, rot: Rot) -> Vec<GridPt> {
    part_def
        .occupied
        .iter()
        .map(|rel| {
            let turned = rotate_relative(*rel, rot);
            GridPt {
                x: at.x + turned.x,
                y: at.y + turned.y,
            }
        })
        .collect()
}

fn rotate_relative(pt: GridPt, rot: Rot) -> GridPt {
    match rot {
        Rot::Deg0 => pt,
        Rot::Deg90 => GridPt { x: -pt.y, y: pt.x },
        Rot::Deg180 => GridPt { x: -pt.x, y: -pt.y },
        Rot::Deg270 => GridPt { x: pt.y, y: -pt.x },
    }
}

fn is_inside_board(board: &Board, pt: GridPt) -> bool {
    pt.x >= 0 && pt.y >= 0 && pt.x < board.width && pt.y < board.height
}
