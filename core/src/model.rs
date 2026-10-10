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
    #[serde(default)]
    pub color: Option<String>,
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
    ReplacePartDefs {
        part_defs: Vec<PartDef>,
    },
    CommitWire {
        net_id: Uuid,
        path: Vec<GridPt>,
    },
    CommitWireAuto {
        path: Vec<GridPt>,
    },
    DeleteWire {
        wire_id: Uuid,
    },
    DeleteNet {
        net_id: Uuid,
    },
    ResizeBoard {
        width: i32,
        height: i32,
    },
    AssignNetName {
        net_id: Uuid,
        name: String,
    },
    AssignNetColor {
        net_id: Uuid,
        color: Option<String>,
    },
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
    MoveRotatePartInst {
        part_id: Uuid,
        to: GridPt,
        rot: Rot,
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
        Command::MoveRotatePartInst { part_id, to, rot } => {
            let Some(index) = state.part_insts.iter().position(|part| part.id == part_id) else {
                return Err("part instance not found".to_owned());
            };
            let part = state.part_insts[index].clone();
            let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
                return Err("part definition not found".to_owned());
            };
            validate_part_placement(state, part_def, part.id, to, rot)?;
            state.part_insts[index].at = to;
            state.part_insts[index].rot = rot;
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
        Command::CommitWireAuto { path } => {
            validate_wire_path(&path)?;
            validate_wire_inside_board(state, &path)?;

            let points: HashSet<GridPt> = path.iter().copied().collect();
            let mut connected_nets: HashSet<Uuid> = state
                .wires
                .iter()
                .filter(|wire| wire.path.iter().any(|point| points.contains(point)))
                .map(|wire| wire.net_id)
                .collect();
            let mut touched_pins = Vec::new();

            for (part_index, part) in state.part_insts.iter().enumerate() {
                let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id) else {
                    continue;
                };
                for pin in &part_def.pins {
                    if points.contains(&absolute_pin_point(part.at, part.rot, pin.pos)) {
                        if let Some(net_id) = part.net_assign.get(&pin.name) {
                            connected_nets.insert(*net_id);
                        }
                        touched_pins.push((part_index, pin.name.clone()));
                    }
                }
            }

            if connected_nets.len() > 1 {
                return Err("wire connects different nets".to_owned());
            }

            let net_id = if let Some(net_id) = connected_nets.into_iter().next() {
                ensure_net_exists(state, net_id);
                net_id
            } else if state.nets.len() == 1
                && state.nets[0].name == "N-1"
                && state.wires.is_empty()
                && state.part_insts.iter().all(|part| part.net_assign.is_empty())
            {
                state.nets[0].id
            } else {
                let net_id = Uuid::new_v4();
                let name = next_auto_net_name(state);
                state.nets.push(Net {
                    id: net_id,
                    name,
                    color: None,
                });
                net_id
            };

            for (part_index, pin_name) in touched_pins {
                state.part_insts[part_index]
                    .net_assign
                    .insert(pin_name, net_id);
            }
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
        Command::DeleteNet { net_id } => {
            if !state.nets.iter().any(|net| net.id == net_id) {
                return Err("net not found".to_owned());
            }
            state.nets.retain(|net| net.id != net_id);
            state.wires.retain(|wire| wire.net_id != net_id);
            for part in &mut state.part_insts {
                part.net_assign.retain(|_, assigned_net_id| *assigned_net_id != net_id);
            }
            Ok(())
        }
        Command::ResizeBoard { width, height } => {
            if width < 1 || height < 1 {
                return Err("board size must be positive".to_owned());
            }
            let resized = Board {
                grid_pitch_mm: state.board.grid_pitch_mm,
                width,
                height,
            };

            for wire in &state.wires {
                for pt in &wire.path {
                    if !is_inside_board(&resized, *pt) {
                        return Err("board resize would place wire outside board".to_owned());
                    }
                }
            }

            for part in &state.part_insts {
                let Some(part_def) = state.part_defs.iter().find(|def| def.id == part.def_id)
                else {
                    return Err("part definition not found".to_owned());
                };
                for occ in absolute_occupied_points(part_def, part.at, part.rot) {
                    if !is_inside_board(&resized, occ) {
                        return Err("board resize would place part outside board".to_owned());
                    }
                }
            }

            state.board = resized;
            Ok(())
        }
        Command::AssignNetName { net_id, name } => {
            if let Some(net) = state.nets.iter_mut().find(|n| n.id == net_id) {
                net.name = name;
                return Ok(());
            }
            state.nets.push(Net {
                id: net_id,
                name,
                color: None,
            });
            Ok(())
        }
        Command::AssignNetColor { net_id, color } => {
            if let Some(value) = color.as_deref() {
                validate_net_color(value)?;
            }
            if let Some(net) = state.nets.iter_mut().find(|n| n.id == net_id) {
                net.color = color;
                return Ok(());
            }
            state.nets.push(Net {
                id: net_id,
                name: default_net_name(net_id),
                color,
            });
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
                return Err(format!("pin name is empty in part definition {}", def.id));
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

fn validate_net_color(color: &str) -> Result<(), String> {
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' {
        return Err("net color must be #RRGGBB".to_owned());
    }
    if bytes[1..].iter().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err("net color must be #RRGGBB".to_owned())
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
        color: None,
    });
}

fn default_net_name(net_id: Uuid) -> String {
    let compact = net_id.as_simple().to_string();
    let short = compact.get(..8).unwrap_or(&compact);
    format!("N-{short}")
}

fn next_auto_net_name(state: &ProjectState) -> String {
    let mut index = 1;
    loop {
        let name = format!("N-{index}");
        if state.nets.iter().all(|net| net.name != name) {
            return name;
        }
        index += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::to_string;

    fn uuid(id: &str) -> Uuid {
        Uuid::parse_str(id).expect("valid uuid")
    }

    fn as_json(state: &ProjectState) -> String {
        to_string(state).expect("state should serialize")
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
                color: None,
            }],
            wires: Vec::new(),
        }
    }

    #[test]
    fn delete_net_removes_its_wires_and_pin_assignments_only() {
        let mut state = test_state();
        let deleted_net = state.nets[0].id;
        let retained_net = uuid("44444444-4444-4444-4444-444444444444");
        state.nets.push(Net { id: retained_net, name: "Keep".to_owned(), color: None });
        state.wires.push(Wire {
            id: uuid("55555555-5555-5555-5555-555555555555"),
            net_id: deleted_net,
            path: vec![GridPt { x: 0, y: 0 }, GridPt { x: 1, y: 0 }],
        });
        state.wires.push(Wire {
            id: uuid("66666666-6666-6666-6666-666666666666"),
            net_id: retained_net,
            path: vec![GridPt { x: 2, y: 0 }, GridPt { x: 3, y: 0 }],
        });
        state.part_defs[0].pins.push(PinDef {
            name: "2".to_owned(),
            pos: GridPt { x: 1, y: 0 },
        });
        state.part_insts[0].net_assign.insert("2".to_owned(), retained_net);

        apply_command(&mut state, Command::DeleteNet { net_id: deleted_net }).unwrap();

        assert_eq!(state.nets.len(), 1);
        assert_eq!(state.nets[0].id, retained_net);
        assert_eq!(state.wires.len(), 1);
        assert_eq!(state.wires[0].net_id, retained_net);
        assert_eq!(state.part_insts[0].net_assign.get("1"), None);
        assert_eq!(state.part_insts[0].net_assign.get("2"), Some(&retained_net));
    }

    #[test]
    fn auto_wire_creates_a_net_after_deleting_the_last_one() {
        let mut state = test_state();
        let old_net_id = state.nets[0].id;
        apply_command(&mut state, Command::DeleteNet { net_id: old_net_id }).unwrap();
        assert!(state.nets.is_empty());
        apply_command(&mut state, Command::CommitWireAuto {
            path: vec![GridPt { x: 0, y: 0 }, GridPt { x: 1, y: 0 }],
        }).unwrap();
        assert_eq!(state.nets.len(), 1);
        assert_eq!(state.nets[0].name, "N-1");
        assert_eq!(state.wires[0].net_id, state.nets[0].id);
        assert_eq!(state.part_insts[0].net_assign.get("1"), Some(&state.nets[0].id));
    }

    #[test]
    fn delete_missing_net_does_not_change_state() {
        let mut state = test_state();
        let before = as_json(&state);
        let result = apply_command(&mut state, Command::DeleteNet {
            net_id: uuid("44444444-4444-4444-4444-444444444444"),
        });

        assert_eq!(result.unwrap_err(), "net not found");
        assert_eq!(as_json(&state), before);
    }

    #[test]
    fn replace_part_defs_accepts_valid_update() {
        let mut state = test_state();
        let def_id = state.part_defs[0].id;
        let before_part_inst = state.part_insts[0].clone();

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
        assert_eq!(state.part_insts[0].id, before_part_inst.id);
        assert_eq!(state.part_insts[0].at, before_part_inst.at);
        assert_eq!(state.part_insts[0].refdes, before_part_inst.refdes);
        assert_eq!(state.part_insts[0].net_assign, before_part_inst.net_assign);
    }

    #[test]
    fn replace_part_defs_rejects_duplicate_part_name() {
        let mut state = test_state();
        let before_json = as_json(&state);

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
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn replace_part_defs_rolls_back_when_existing_assignment_becomes_invalid() {
        let mut state = test_state();
        let before_json = as_json(&state);
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
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn replace_part_defs_rolls_back_when_existing_part_goes_outside_board() {
        let mut state = test_state();
        let before_json = as_json(&state);
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
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn assign_net_color_updates_existing_net() {
        let mut state = test_state();
        let net_id = state.nets[0].id;

        let result = apply_command(
            &mut state,
            Command::AssignNetColor {
                net_id,
                color: Some("#12Ab9F".to_owned()),
            },
        );

        assert!(result.is_ok());
        assert_eq!(state.nets[0].color.as_deref(), Some("#12Ab9F"));
    }

    #[test]
    fn assign_net_color_rejects_invalid_format() {
        let mut state = test_state();
        let before_json = as_json(&state);
        let net_id = state.nets[0].id;

        let result = apply_command(
            &mut state,
            Command::AssignNetColor {
                net_id,
                color: Some("red".to_owned()),
            },
        );

        assert!(result.is_err());
        assert!(result.expect_err("must fail").contains("#RRGGBB"));
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn assign_net_color_creates_missing_net() {
        let mut state = test_state();
        let new_net_id = uuid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

        let result = apply_command(
            &mut state,
            Command::AssignNetColor {
                net_id: new_net_id,
                color: Some("#00cc88".to_owned()),
            },
        );

        assert!(result.is_ok());
        let net = state
            .nets
            .iter()
            .find(|net| net.id == new_net_id)
            .expect("net should be created");
        assert_eq!(net.name, "N-aaaaaaaa");
        assert_eq!(net.color.as_deref(), Some("#00cc88"));
    }

    #[test]
    fn move_rotate_part_inst_applies_position_and_rotation_together() {
        let mut state = test_state();
        let part_id = state.part_insts[0].id;

        let result = apply_command(
            &mut state,
            Command::MoveRotatePartInst {
                part_id,
                to: GridPt { x: 4, y: 2 },
                rot: Rot::Deg90,
            },
        );

        assert!(result.is_ok());
        assert_eq!(state.part_insts[0].at, GridPt { x: 4, y: 2 });
        assert!(matches!(state.part_insts[0].rot, Rot::Deg90));
    }

    #[test]
    fn resize_board_updates_dimensions_when_all_objects_fit() {
        let mut state = test_state();

        let result = apply_command(
            &mut state,
            Command::ResizeBoard {
                width: 80,
                height: 50,
            },
        );

        assert!(result.is_ok());
        assert_eq!(state.board.width, 80);
        assert_eq!(state.board.height, 50);
    }

    #[test]
    fn resize_board_rejects_when_part_would_be_outside() {
        let mut state = test_state();
        state.part_insts[0].at = GridPt { x: 10, y: 0 };
        let before_json = as_json(&state);

        let result = apply_command(
            &mut state,
            Command::ResizeBoard {
                width: 5,
                height: 5,
            },
        );

        assert!(result.is_err());
        assert!(result
            .expect_err("must fail")
            .contains("part outside board"));
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn resize_board_rejects_when_wire_would_be_outside() {
        let mut state = test_state();
        state.wires.push(Wire {
            id: uuid("44444444-4444-4444-4444-444444444444"),
            net_id: state.nets[0].id,
            path: vec![GridPt { x: 0, y: 0 }, GridPt { x: 20, y: 0 }],
        });
        let before_json = as_json(&state);

        let result = apply_command(
            &mut state,
            Command::ResizeBoard {
                width: 8,
                height: 8,
            },
        );

        assert!(result.is_err());
        assert!(result
            .expect_err("must fail")
            .contains("wire outside board"));
        assert_eq!(as_json(&state), before_json);
    }

    #[test]
    fn auto_wire_assigns_both_rotated_and_unrotated_pins() {
        let mut state = test_state();
        state.part_defs[0].pins[0].pos = GridPt { x: 1, y: 0 };
        state.part_insts[0].net_assign.clear();
        let mut second = state.part_insts[0].clone();
        second.id = uuid("44444444-4444-4444-4444-444444444444");
        second.at = GridPt { x: 2, y: 0 };
        second.rot = Rot::Deg90;
        second.refdes = "U2".to_owned();
        state.part_insts.push(second);

        apply_command(
            &mut state,
            Command::CommitWireAuto {
                path: vec![
                    GridPt { x: 1, y: 0 },
                    GridPt { x: 2, y: 0 },
                    GridPt { x: 2, y: 1 },
                ],
            },
        )
        .expect("wire should be committed");

        let net_id = state.nets[0].id;
        assert_eq!(state.nets.len(), 1);
        assert_eq!(state.wires[0].net_id, net_id);
        assert_eq!(state.part_insts[0].net_assign.get("1"), Some(&net_id));
        assert_eq!(state.part_insts[1].net_assign.get("1"), Some(&net_id));
    }

    #[test]
    fn auto_wire_reuses_touched_wire_net_and_creates_separate_net() {
        let mut state = test_state();
        state.part_insts[0].net_assign.clear();
        apply_command(
            &mut state,
            Command::CommitWireAuto {
                path: vec![GridPt { x: 0, y: 0 }, GridPt { x: 1, y: 0 }],
            },
        )
        .expect("first wire should be committed");
        let first_net = state.wires[0].net_id;

        apply_command(
            &mut state,
            Command::CommitWireAuto {
                path: vec![GridPt { x: 1, y: 0 }, GridPt { x: 2, y: 0 }],
            },
        )
        .expect("extension should be committed");
        assert_eq!(state.wires[1].net_id, first_net);

        apply_command(
            &mut state,
            Command::CommitWireAuto {
                path: vec![GridPt { x: 10, y: 10 }, GridPt { x: 11, y: 10 }],
            },
        )
        .expect("separate wire should be committed");
        assert_eq!(state.nets.len(), 2);
        assert_eq!(state.nets[1].name, "N-2");
        assert_eq!(state.wires[2].net_id, state.nets[1].id);
    }

    #[test]
    fn auto_wire_rejects_distinct_existing_nets_without_mutation() {
        let mut state = test_state();
        let mut second = state.part_insts[0].clone();
        second.id = uuid("44444444-4444-4444-4444-444444444444");
        second.at = GridPt { x: 2, y: 0 };
        second.refdes = "U2".to_owned();
        second.net_assign.insert(
            "1".to_owned(),
            uuid("55555555-5555-5555-5555-555555555555"),
        );
        state.part_insts.push(second);
        let before_json = as_json(&state);

        let result = apply_command(
            &mut state,
            Command::CommitWireAuto {
                path: vec![
                    GridPt { x: 0, y: 0 },
                    GridPt { x: 1, y: 0 },
                    GridPt { x: 2, y: 0 },
                ],
            },
        );

        assert_eq!(result.expect_err("must fail"), "wire connects different nets");
        assert_eq!(as_json(&state), before_json);
    }
}
