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
    ReplacePartDefs { part_defs: Vec<PartDef> },
    CommitWire { net_id: Uuid, path: Vec<GridPt> },
    DeleteWire { wire_id: Uuid },
    AssignNetName { net_id: Uuid, name: String },
    AssignPinToNet {
        part_id: Uuid,
        pin_name: String,
        net_id: Uuid,
    },
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
        Command::ReplacePartDefs { part_defs } => {
            validate_part_defs(&part_defs)?;

            let previous = std::mem::replace(&mut state.part_defs, part_defs);
            if let Err(err) = validate_part_instances_against_defs(state) {
                state.part_defs = previous;
                return Err(err);
            }
            Ok(())
        }
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
            validate_wire_inside_board(state, &path)?;
            ensure_net_exists(state, net_id);
            state.wires.push(Wire {
                id: Uuid::new_v4(),
                net_id,
                path,
            });
            Ok(())
        }
        Command::DeleteWire { wire_id } => {
            let before = state.wires.len();
            state.wires.retain(|wire| wire.id != wire_id);
            if state.wires.len() == before {
                return Err("wire not found".to_owned());
            }
            Ok(())
        }
        Command::AssignNetName { net_id, name } => {
            if let Some(net) = state.nets.iter_mut().find(|n| n.id == net_id) {
                net.name = name;
                return Ok(());
            }
            state.nets.push(Net { id: net_id, name });
            Ok(())
        }
        Command::AssignPinToNet {
            part_id,
            pin_name,
            net_id,
        } => {
            let Some(index) = state.part_insts.iter().position(|part| part.id == part_id) else {
                return Err("part instance not found".to_owned());
            };
            let part = state.part_insts[index].clone();
            let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
                return Err("part definition not found".to_owned());
            };
            if !part_def.pins.iter().any(|pin| pin.name == pin_name) {
                return Err("pin not found in part definition".to_owned());
            }
            ensure_net_exists(state, net_id);
            state.part_insts[index].net_assign.insert(pin_name, net_id);
            Ok(())
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
    let mut occ_part_hard: HashMap<GridPt, Uuid> = HashMap::new();
    let mut part_pin_points: HashSet<GridPt> = HashSet::new();

    match rebuild_part_occupancy_map(state) {
        Ok(map) => {
            occ_part_hard = map;
        }
        Err(err) => {
            issues.push(DrcIssue {
                level: IssueLevel::Error,
                code: "PART_COLLISION".to_owned(),
                message: err,
                at: None,
            });
        }
    }

    for part in &state.part_insts {
        let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
            continue;
        };
        for pin in &part_def.pins {
            part_pin_points.insert(absolute_pin_point(part.at, part.rot, pin.pos));
        }
    }

    for wire in &state.wires {
        for pt in &wire.path {
            occ_wire.entry(*pt).or_default().insert(wire.net_id);
            if occ_part_hard.contains_key(pt) && !part_pin_points.contains(pt) {
                issues.push(DrcIssue {
                    level: IssueLevel::Error,
                    code: "WIRE_PART_COLLISION".to_owned(),
                    message: "wire point overlaps part occupied cell".to_owned(),
                    at: Some(*pt),
                });
            }
        }
    }

    for (pt, nets) in &occ_wire {
        if nets.len() > 1 {
            issues.push(DrcIssue {
                level: IssueLevel::Error,
                code: "SHORT".to_owned(),
                message: "multiple nets share one grid point".to_owned(),
                at: Some(*pt),
            });
        }
    }

    for part in &state.part_insts {
        let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
            continue;
        };
        for (pin_name, net_id) in &part.net_assign {
            let Some(pin_def) = part_def.pins.iter().find(|pin| &pin.name == pin_name) else {
                continue;
            };
            let pin_pt = absolute_pin_point(part.at, part.rot, pin_def.pos);
            let connected = occ_wire
                .get(&pin_pt)
                .map(|nets| nets.contains(net_id))
                .unwrap_or(false);
            if !connected {
                issues.push(DrcIssue {
                    level: IssueLevel::Warning,
                    code: "UNCONNECTED_PIN".to_owned(),
                    message: format!(
                        "{}.{} assigned to net but not connected by wire",
                        part.refdes, pin_name
                    ),
                    at: Some(pin_pt),
                });
            }
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

fn validate_part_defs(part_defs: &[PartDef]) -> Result<(), String> {
    let mut def_ids = HashSet::new();
    let mut def_names = HashSet::new();

    for def in part_defs {
        if !def_ids.insert(def.id) {
            return Err(format!("duplicate part definition id: {}", def.id));
        }

        let normalized_name = def.name.trim();
        if normalized_name.is_empty() {
            return Err(format!("part definition name is empty (id: {})", def.id));
        }
        if !def_names.insert(normalized_name.to_owned()) {
            return Err(format!("duplicate part definition name: {normalized_name}"));
        }

        if def.pins.is_empty() {
            return Err(format!(
                "part definition must have at least one pin (id: {})",
                def.id
            ));
        }
        if def.occupied.is_empty() {
            return Err(format!(
                "part definition must have at least one occupied cell (id: {})",
                def.id
            ));
        }

        let mut pin_names = HashSet::new();
        let mut pin_positions = HashSet::new();
        for pin in &def.pins {
            let normalized_pin_name = pin.name.trim();
            if normalized_pin_name.is_empty() {
                return Err(format!(
                    "pin name is empty in part definition {}",
                    def.id
                ));
            }
            if !pin_names.insert(normalized_pin_name.to_owned()) {
                return Err(format!(
                    "duplicate pin name in part definition {}: {}",
                    def.id, normalized_pin_name
                ));
            }
            if !pin_positions.insert(pin.pos) {
                return Err(format!(
                    "duplicate pin position in part definition {}: ({},{})",
                    def.id, pin.pos.x, pin.pos.y
                ));
            }
        }

        let mut occupied_positions = HashSet::new();
        for occ in &def.occupied {
            if !occupied_positions.insert(*occ) {
                return Err(format!(
                    "duplicate occupied position in part definition {}: ({},{})",
                    def.id, occ.x, occ.y
                ));
            }
        }
    }

    Ok(())
}

fn validate_part_instances_against_defs(state: &ProjectState) -> Result<(), String> {
    for part in &state.part_insts {
        let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
            return Err(format!(
                "part definition not found for part instance {}",
                part.id
            ));
        };

        let pin_names: HashSet<&str> = part_def.pins.iter().map(|pin| pin.name.as_str()).collect();
        for assigned_pin_name in part.net_assign.keys() {
            if !pin_names.contains(assigned_pin_name.as_str()) {
                return Err(format!(
                    "assigned pin not found in part definition {}: {}",
                    part.def_id, assigned_pin_name
                ));
            }
        }
    }

    rebuild_part_occupancy_map(state).map(|_| ())
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

fn validate_wire_inside_board(state: &ProjectState, path: &[GridPt]) -> Result<(), String> {
    for pt in path {
        if !is_inside_board(&state.board, *pt) {
            return Err("wire path is outside board".to_owned());
        }
    }
    Ok(())
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

fn absolute_pin_point(at: GridPt, rot: Rot, rel_pin: GridPt) -> GridPt {
    let turned = rotate_relative(rel_pin, rot);
    GridPt {
        x: at.x + turned.x,
        y: at.y + turned.y,
    }
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

fn ensure_net_exists(state: &mut ProjectState, net_id: Uuid) {
    if state.nets.iter().any(|net| net.id == net_id) {
        return;
    }
    state.nets.push(Net {
        id: net_id,
        name: default_net_name(net_id),
    });
}

fn default_net_name(net_id: Uuid) -> String {
    let compact = net_id.as_simple().to_string();
    let short = compact.get(..8).unwrap_or(&compact);
    format!("N-{short}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn uuid(id: &str) -> Uuid {
        Uuid::parse_str(id).expect("valid uuid")
    }

    fn test_state() -> ProjectState {
        let def_id = uuid("11111111-1111-1111-1111-111111111111");
        let part_id = uuid("22222222-2222-2222-2222-222222222222");
        let net_id = uuid("33333333-3333-3333-3333-333333333333");

        ProjectState {
            schema_version: 1,
            board: Board {
                grid_pitch_mm: 2.54,
                width: 64,
                height: 40,
            },
            part_defs: vec![PartDef {
                id: def_id,
                name: "Test Part".to_owned(),
                pins: vec![PinDef {
                    name: "1".to_owned(),
                    pos: GridPt { x: 0, y: 0 },
                }],
                occupied: vec![GridPt { x: 0, y: 0 }],
            }],
            part_insts: vec![PartInst {
                id: part_id,
                def_id,
                at: GridPt { x: 0, y: 0 },
                rot: Rot::Deg0,
                refdes: "U1".to_owned(),
                net_assign: HashMap::from([("1".to_owned(), net_id)]),
            }],
            nets: vec![Net {
                id: net_id,
                name: "N-1".to_owned(),
            }],
            wires: Vec::new(),
        }
    }

    #[test]
    fn replace_part_defs_accepts_valid_update() {
        let mut state = test_state();
        let def_id = state.part_defs[0].id;

        let result = apply_command(
            &mut state,
            Command::ReplacePartDefs {
                part_defs: vec![PartDef {
                    id: def_id,
                    name: "Updated Part".to_owned(),
                    pins: vec![
                        PinDef {
                            name: "1".to_owned(),
                            pos: GridPt { x: 0, y: 0 },
                        },
                        PinDef {
                            name: "2".to_owned(),
                            pos: GridPt { x: 1, y: 0 },
                        },
                    ],
                    occupied: vec![GridPt { x: 0, y: 0 }, GridPt { x: 1, y: 0 }],
                }],
            },
        );

        assert!(result.is_ok());
        assert_eq!(state.part_defs[0].name, "Updated Part");
        assert_eq!(state.part_defs[0].pins.len(), 2);
    }

    #[test]
    fn replace_part_defs_rejects_duplicate_part_name() {
        let mut state = test_state();

        let result = apply_command(
            &mut state,
            Command::ReplacePartDefs {
                part_defs: vec![
                    PartDef {
                        id: uuid("44444444-4444-4444-4444-444444444444"),
                        name: "Dup".to_owned(),
                        pins: vec![PinDef {
                            name: "1".to_owned(),
                            pos: GridPt { x: 0, y: 0 },
                        }],
                        occupied: vec![GridPt { x: 0, y: 0 }],
                    },
                    PartDef {
                        id: uuid("55555555-5555-5555-5555-555555555555"),
                        name: "Dup".to_owned(),
                        pins: vec![PinDef {
                            name: "1".to_owned(),
                            pos: GridPt { x: 0, y: 0 },
                        }],
                        occupied: vec![GridPt { x: 0, y: 0 }],
                    },
                ],
            },
        );

        assert!(result.is_err());
        assert!(result
            .expect_err("must fail")
            .contains("duplicate part definition name"));
    }

    #[test]
    fn replace_part_defs_rolls_back_when_existing_assignment_becomes_invalid() {
        let mut state = test_state();
        let previous = state.part_defs.clone();
        let def_id = state.part_defs[0].id;

        let result = apply_command(
            &mut state,
            Command::ReplacePartDefs {
                part_defs: vec![PartDef {
                    id: def_id,
                    name: "Test Part".to_owned(),
                    pins: vec![PinDef {
                        name: "2".to_owned(),
                        pos: GridPt { x: 0, y: 0 },
                    }],
                    occupied: vec![GridPt { x: 0, y: 0 }],
                }],
            },
        );

        assert!(result.is_err());
        assert!(result
            .expect_err("must fail")
            .contains("assigned pin not found"));
        assert_eq!(state.part_defs[0].pins[0].name, previous[0].pins[0].name);
    }

    #[test]
    fn replace_part_defs_rolls_back_when_existing_part_goes_outside_board() {
        let mut state = test_state();
        let previous = state.part_defs.clone();
        let def_id = state.part_defs[0].id;

        let result = apply_command(
            &mut state,
            Command::ReplacePartDefs {
                part_defs: vec![PartDef {
                    id: def_id,
                    name: "Test Part".to_owned(),
                    pins: vec![PinDef {
                        name: "1".to_owned(),
                        pos: GridPt { x: 0, y: 0 },
                    }],
                    occupied: vec![GridPt { x: -1, y: 0 }],
                }],
            },
        );

        assert!(result.is_err());
        assert!(result.expect_err("must fail").contains("outside board"));
        assert_eq!(state.part_defs[0].occupied, previous[0].occupied);
    }
}
