#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import struct
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path


EPSILON = 1e-9


@dataclass(frozen=True)
class Vec3:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class Triangle:
    a: Vec3
    b: Vec3
    c: Vec3


class Mesh:
    def __init__(self, triangles: list[Triangle], source_format: str, source_name: str):
        self.triangles = triangles
        self.source_format = source_format
        self.source_name = source_name

    @property
    def triangle_count(self) -> int:
        return len(self.triangles)

    @property
    def vertex_count(self) -> int:
        return len(self.triangles) * 3

    def bounding_box(self) -> dict[str, float]:
        xs: list[float] = []
        ys: list[float] = []
        zs: list[float] = []
        for tri in self.triangles:
            for point in (tri.a, tri.b, tri.c):
                xs.append(point.x)
                ys.append(point.y)
                zs.append(point.z)
        return {
            "min_x": min(xs) if xs else 0.0,
            "min_y": min(ys) if ys else 0.0,
            "min_z": min(zs) if zs else 0.0,
            "max_x": max(xs) if xs else 0.0,
            "max_y": max(ys) if ys else 0.0,
            "max_z": max(zs) if zs else 0.0,
        }

    def translated(self, dx: float, dy: float, dz: float) -> "Mesh":
        return Mesh(
            [
                Triangle(
                    Vec3(tri.a.x + dx, tri.a.y + dy, tri.a.z + dz),
                    Vec3(tri.b.x + dx, tri.b.y + dy, tri.b.z + dz),
                    Vec3(tri.c.x + dx, tri.c.y + dy, tri.c.z + dz),
                )
                for tri in self.triangles
            ],
            self.source_format,
            self.source_name,
        )


def load_mesh(path: Path) -> Mesh:
    suffix = path.suffix.lower()
    if suffix == ".stl":
        return load_stl(path)
    if suffix == ".3mf":
        return load_3mf(path)
    raise ValueError(f"Unsupported input format: {path.suffix}")


def load_stl(path: Path) -> Mesh:
    data = path.read_bytes()
    triangles = parse_binary_stl(data)
    if triangles is None:
        triangles = parse_ascii_stl(data.decode("utf-8", errors="ignore"))
    if not triangles:
        raise ValueError("No triangles found in STL file.")
    return Mesh(triangles, "stl", path.name)


def parse_binary_stl(data: bytes) -> list[Triangle] | None:
    if len(data) < 84:
        return None
    triangle_count = struct.unpack_from("<I", data, 80)[0]
    expected_size = 84 + triangle_count * 50
    if expected_size != len(data):
        return None

    triangles: list[Triangle] = []
    offset = 84
    for _ in range(triangle_count):
        values = struct.unpack_from("<12fH", data, offset)
        offset += 50
        a = Vec3(values[3], values[4], values[5])
        b = Vec3(values[6], values[7], values[8])
        c = Vec3(values[9], values[10], values[11])
        triangles.append(Triangle(a, b, c))
    return triangles


def parse_ascii_stl(text: str) -> list[Triangle]:
    vertices: list[Vec3] = []
    triangles: list[Triangle] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("vertex "):
            continue
        _, x_str, y_str, z_str = line.split()
        vertices.append(Vec3(float(x_str), float(y_str), float(z_str)))
        if len(vertices) == 3:
            triangles.append(Triangle(vertices[0], vertices[1], vertices[2]))
            vertices = []
    return triangles


def load_3mf(path: Path) -> Mesh:
    with zipfile.ZipFile(path) as archive:
        model_map = {
            name.lstrip("/"): ET.fromstring(archive.read(name))
            for name in archive.namelist()
            if name.lower().endswith(".model")
        }
    if not model_map:
        raise ValueError("No 3MF model XML found in archive.")
    return parse_3mf_models(model_map, source_name=path.name)


def identity_transform() -> tuple[float, ...]:
    return (1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0)


def parse_transform(raw: str | None) -> tuple[float, ...]:
    if not raw:
        return identity_transform()
    parts = [float(value) for value in raw.split()]
    if len(parts) != 12:
        raise ValueError(f"Unsupported 3MF transform with {len(parts)} values.")
    return tuple(parts)


def multiply_transform(lhs: tuple[float, ...], rhs: tuple[float, ...]) -> tuple[float, ...]:
    a11, a12, a13, a21, a22, a23, a31, a32, a33, atx, aty, atz = lhs
    b11, b12, b13, b21, b22, b23, b31, b32, b33, btx, bty, btz = rhs
    return (
        a11 * b11 + a12 * b21 + a13 * b31,
        a11 * b12 + a12 * b22 + a13 * b32,
        a11 * b13 + a12 * b23 + a13 * b33,
        a21 * b11 + a22 * b21 + a23 * b31,
        a21 * b12 + a22 * b22 + a23 * b32,
        a21 * b13 + a22 * b23 + a23 * b33,
        a31 * b11 + a32 * b21 + a33 * b31,
        a31 * b12 + a32 * b22 + a33 * b32,
        a31 * b13 + a32 * b23 + a33 * b33,
        a11 * btx + a12 * bty + a13 * btz + atx,
        a21 * btx + a22 * bty + a23 * btz + aty,
        a31 * btx + a32 * bty + a33 * btz + atz,
    )


def apply_transform(point: Vec3, transform: tuple[float, ...]) -> Vec3:
    a11, a12, a13, a21, a22, a23, a31, a32, a33, atx, aty, atz = transform
    return Vec3(
        a11 * point.x + a12 * point.y + a13 * point.z + atx,
        a21 * point.x + a22 * point.y + a23 * point.z + aty,
        a31 * point.x + a32 * point.y + a33 * point.z + atz,
    )


def parse_3mf_models(model_map: dict[str, ET.Element], source_name: str) -> Mesh:
    root_path = "3D/3dmodel.model"
    if root_path not in model_map:
        root_path = sorted(model_map.keys())[0]

    root_model = model_map[root_path]
    triangles = flatten_3mf_build(model_map, root_path, root_model)
    if not triangles:
        raise ValueError("No triangles resolved from 3MF model.")
    return Mesh(triangles, "3mf", source_name)


def model_namespace(root: ET.Element) -> str:
    if root.tag.startswith("{"):
        return root.tag.split("}")[0].strip("{")
    return ""


def qname(namespace: str, tag: str) -> str:
    return f"{{{namespace}}}{tag}" if namespace else tag


def object_index(root: ET.Element) -> dict[str, ET.Element]:
    namespace = model_namespace(root)
    resources = root.find(qname(namespace, "resources"))
    if resources is None:
        return {}
    return {
        object_node.attrib["id"]: object_node
        for object_node in resources.findall(qname(namespace, "object"))
        if "id" in object_node.attrib
    }


def normalize_model_path(raw: str | None, fallback_path: str) -> str:
    if not raw:
        return fallback_path
    return raw.lstrip("/")


def parse_mesh_from_object(object_node: ET.Element, namespace: str, transform: tuple[float, ...]) -> list[Triangle]:
    mesh_node = object_node.find(qname(namespace, "mesh"))
    if mesh_node is None:
        return []

    vertices_node = mesh_node.find(qname(namespace, "vertices"))
    triangles_node = mesh_node.find(qname(namespace, "triangles"))
    if vertices_node is None or triangles_node is None:
        return []

    vertices: list[Vec3] = []
    for vertex_node in vertices_node.findall(qname(namespace, "vertex")):
        point = Vec3(
            float(vertex_node.attrib["x"]),
            float(vertex_node.attrib["y"]),
            float(vertex_node.attrib["z"]),
        )
        vertices.append(apply_transform(point, transform))

    triangles: list[Triangle] = []
    for tri_node in triangles_node.findall(qname(namespace, "triangle")):
        v1 = int(tri_node.attrib["v1"])
        v2 = int(tri_node.attrib["v2"])
        v3 = int(tri_node.attrib["v3"])
        triangles.append(Triangle(vertices[v1], vertices[v2], vertices[v3]))
    return triangles


def resolve_object_triangles(
    model_map: dict[str, ET.Element],
    model_path: str,
    object_id: str,
    transform: tuple[float, ...],
) -> list[Triangle]:
    model_root = model_map.get(model_path)
    if model_root is None:
        raise ValueError(f"Referenced 3MF model path not found: {model_path}")

    namespace = model_namespace(model_root)
    objects = object_index(model_root)
    object_node = objects.get(object_id)
    if object_node is None:
        raise ValueError(f"Referenced 3MF object id not found: {object_id} in {model_path}")

    direct_mesh = parse_mesh_from_object(object_node, namespace, transform)
    if direct_mesh:
        return direct_mesh

    components_node = object_node.find(qname(namespace, "components"))
    if components_node is None:
        return []

    triangles: list[Triangle] = []
    for component_node in components_node.findall(qname(namespace, "component")):
        component_path = normalize_model_path(
            component_node.attrib.get("{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}path"),
            model_path,
        )
        component_object_id = component_node.attrib["objectid"]
        component_transform = parse_transform(component_node.attrib.get("transform"))
        triangles.extend(
            resolve_object_triangles(
                model_map,
                component_path,
                component_object_id,
                multiply_transform(transform, component_transform),
            )
        )
    return triangles


def flatten_3mf_build(model_map: dict[str, ET.Element], root_path: str, root_model: ET.Element) -> list[Triangle]:
    namespace = model_namespace(root_model)
    build_node = root_model.find(qname(namespace, "build"))
    triangles: list[Triangle] = []

    if build_node is None:
        objects = object_index(root_model)
        for object_id in objects:
            triangles.extend(resolve_object_triangles(model_map, root_path, object_id, identity_transform()))
        return triangles

    for item_node in build_node.findall(qname(namespace, "item")):
        printable = item_node.attrib.get("printable", "1")
        if printable == "0":
            continue
        object_id = item_node.attrib["objectid"]
        item_transform = parse_transform(item_node.attrib.get("transform"))
        triangles.extend(resolve_object_triangles(model_map, root_path, object_id, item_transform))

    return triangles


def point_key(point: tuple[float, float], digits: int = 6) -> tuple[float, float]:
    return (round(point[0], digits), round(point[1], digits))


def distance_2d(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def signed_area(path: list[tuple[float, float]]) -> float:
    if len(path) < 3:
        return 0.0
    area = 0.0
    for index in range(len(path) - 1):
        x1, y1 = path[index]
        x2, y2 = path[index + 1]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def path_length(path: list[tuple[float, float]]) -> float:
    return sum(distance_2d(path[index], path[index + 1]) for index in range(len(path) - 1))


def triangle_plane_segment(triangle: Triangle, z: float) -> tuple[tuple[float, float], tuple[float, float]] | None:
    edges = ((triangle.a, triangle.b), (triangle.b, triangle.c), (triangle.c, triangle.a))
    intersections: list[tuple[float, float]] = []

    for p1, p2 in edges:
        z1 = p1.z
        z2 = p2.z

        if abs(z1 - z) < EPSILON and abs(z2 - z) < EPSILON:
            continue
        if (z1 - z) * (z2 - z) > 0:
            continue
        if abs(z2 - z1) < EPSILON:
            continue

        t = (z - z1) / (z2 - z1)
        if t < -EPSILON or t > 1 + EPSILON:
            continue

        x = p1.x + t * (p2.x - p1.x)
        y = p1.y + t * (p2.y - p1.y)
        candidate = (x, y)
        if point_key(candidate) not in {point_key(existing) for existing in intersections}:
            intersections.append(candidate)

    if len(intersections) != 2:
        return None

    return intersections[0], intersections[1]


def collect_layer_segments(mesh: Mesh, z: float) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    unique: dict[tuple[tuple[float, float], tuple[float, float]], tuple[tuple[float, float], tuple[float, float]]] = {}
    for triangle in mesh.triangles:
        segment = triangle_plane_segment(triangle, z)
        if segment is None:
            continue
        a, b = segment
        if point_key(a) == point_key(b):
            continue
        key = tuple(sorted((point_key(a), point_key(b))))
        if key not in unique:
            unique[key] = segment
    return list(unique.values())


def simplify_path(path: list[tuple[float, float]], closed: bool) -> list[tuple[float, float]]:
    if len(path) < 3:
        return path

    working = path[:]
    if closed and point_key(working[0]) != point_key(working[-1]):
        working.append(working[0])

    changed = True
    while changed and len(working) >= (4 if closed else 3):
        changed = False
        limit = len(working) - 1
        for index in range(limit):
            prev_index = (index - 1) % limit
            next_index = (index + 1) % limit
            prev_point = working[prev_index]
            point = working[index]
            next_point = working[next_index]
            cross = (point[0] - prev_point[0]) * (next_point[1] - point[1]) - (point[1] - prev_point[1]) * (next_point[0] - point[0])
            if abs(cross) <= 1e-6:
                del working[index]
                if closed:
                    working[-1] = working[0]
                changed = True
                break

    return working


def connect_segments_to_paths(
    segments: list[tuple[tuple[float, float], tuple[float, float]]]
) -> tuple[list[list[tuple[float, float]]], list[list[tuple[float, float]]]]:
    if not segments:
        return [], []

    point_lookup: dict[tuple[float, float], tuple[float, float]] = {}
    adjacency: dict[tuple[float, float], list[int]] = {}

    for edge_index, (a, b) in enumerate(segments):
        for point in (a, b):
            key = point_key(point)
            point_lookup.setdefault(key, point)
            adjacency.setdefault(key, []).append(edge_index)

    visited_edges: set[int] = set()
    closed_paths: list[list[tuple[float, float]]] = []
    open_paths: list[list[tuple[float, float]]] = []

    def walk(start_edge: int, start_key: tuple[float, float] | None = None) -> list[tuple[float, float]]:
        edge = segments[start_edge]
        key_a = point_key(edge[0])
        key_b = point_key(edge[1])
        current_start = start_key or key_a
        current_end = key_b if current_start == key_a else key_a
        path_keys = [current_start, current_end]
        visited_edges.add(start_edge)

        while True:
            candidates = [edge_index for edge_index in adjacency[current_end] if edge_index not in visited_edges]
            if not candidates:
                break

            next_edge_index = candidates[0]
            visited_edges.add(next_edge_index)
            next_a, next_b = segments[next_edge_index]
            next_a_key = point_key(next_a)
            next_b_key = point_key(next_b)
            next_key = next_b_key if next_a_key == current_end else next_a_key
            path_keys.append(next_key)
            current_end = next_key

            if current_end == path_keys[0]:
                break

        return [point_lookup[key] for key in path_keys]

    for edge_index in range(len(segments)):
        if edge_index in visited_edges:
            continue

        a_key = point_key(segments[edge_index][0])
        b_key = point_key(segments[edge_index][1])
        degree_a = len(adjacency[a_key])
        degree_b = len(adjacency[b_key])

        start_key = a_key
        if degree_a == 1 and degree_b > 1:
            start_key = a_key
        elif degree_b == 1 and degree_a > 1:
            start_key = b_key

        path = walk(edge_index, start_key)
        closed = len(path) > 2 and point_key(path[0]) == point_key(path[-1])
        simplified = simplify_path(path, closed=closed)
        if closed:
            closed_paths.append(simplified)
        else:
            open_paths.append(simplified)

    closed_paths.sort(key=lambda path: abs(signed_area(path)), reverse=True)
    open_paths.sort(key=path_length, reverse=True)
    return closed_paths, open_paths


def build_layer_geometry(mesh: Mesh, layer_height: float, first_layer_height: float | None = None) -> dict:
    if layer_height <= 0:
        raise ValueError("layer_height must be positive.")

    bbox = mesh.bounding_box()
    z_min = bbox["min_z"]
    z_max = bbox["max_z"]
    first = first_layer_height if first_layer_height is not None else layer_height
    if first <= 0:
        raise ValueError("first_layer_height must be positive.")

    layers: list[dict] = []
    current_z = z_min + first
    layer_index = 0

    while current_z <= z_max + EPSILON:
        segments = collect_layer_segments(mesh, current_z)
        closed_paths, open_paths = connect_segments_to_paths(segments)
        layers.append(
            {
                "index": layer_index,
                "z": round(current_z, 6),
                "segment_count": len(segments),
                "closed_paths": closed_paths,
                "open_paths": open_paths,
            }
        )
        current_z += layer_height
        layer_index += 1

    return {
        "mesh": {
            "source_name": mesh.source_name,
            "source_format": mesh.source_format,
            "triangle_count": mesh.triangle_count,
            "vertex_count": mesh.vertex_count,
            "bounding_box": bbox,
        },
        "slicing": {
            "layer_height": layer_height,
            "first_layer_height": first,
            "layer_count": len(layers),
            "layers": layers,
        },
    }


def build_slice_plan(mesh: Mesh, layer_height: float, first_layer_height: float | None = None) -> dict:
    geometry = build_layer_geometry(mesh, layer_height, first_layer_height)
    return {
        "mesh": geometry["mesh"],
        "slicing": {
            "layer_height": geometry["slicing"]["layer_height"],
            "first_layer_height": geometry["slicing"]["first_layer_height"],
            "layer_count": geometry["slicing"]["layer_count"],
            "total_segments": sum(layer["segment_count"] for layer in geometry["slicing"]["layers"]),
            "total_closed_paths": sum(len(layer["closed_paths"]) for layer in geometry["slicing"]["layers"]),
            "total_open_paths": sum(len(layer["open_paths"]) for layer in geometry["slicing"]["layers"]),
            "layers": [
                {
                    "index": layer["index"],
                    "z": layer["z"],
                    "segments": layer["segment_count"],
                    "closed_paths": len(layer["closed_paths"]),
                    "open_paths": len(layer["open_paths"]),
                }
                for layer in geometry["slicing"]["layers"]
            ],
        },
    }


def generate_gcode(
    mesh: Mesh,
    layer_height: float,
    first_layer_height: float | None,
    line_width: float,
    filament_diameter: float,
    nozzle_temperature: float,
    bed_temperature: float,
    print_speed: float,
    travel_speed: float,
) -> str:
    if line_width <= 0:
        raise ValueError("line_width must be positive.")
    if filament_diameter <= 0:
        raise ValueError("filament_diameter must be positive.")

    normalized_mesh = mesh
    original_bbox = mesh.bounding_box()
    z_shift = -original_bbox["min_z"] if original_bbox["min_z"] < 0 else 0.0
    if abs(z_shift) > EPSILON:
        normalized_mesh = mesh.translated(0.0, 0.0, z_shift)

    geometry = build_layer_geometry(normalized_mesh, layer_height, first_layer_height)
    filament_area = math.pi * (filament_diameter / 2.0) ** 2
    extrusion_multiplier = line_width * layer_height / filament_area
    extrusion_e = 0.0
    travel_rate = travel_speed * 60.0
    print_rate = print_speed * 60.0
    bbox = geometry["mesh"]["bounding_box"]

    lines = [
        "; Swapmod native slicer prototype",
        f"; source={mesh.source_name}",
        f"; triangles={mesh.triangle_count}",
        f"; layer_height={layer_height}",
        f"; first_layer_height={first_layer_height if first_layer_height is not None else layer_height}",
        f"; z_shift_applied={z_shift:.4f}",
        "G21",
        "G90",
        "M82",
        "G92 E0",
        f"M104 S{nozzle_temperature:.0f}",
        f"M140 S{bed_temperature:.0f}",
        f"G0 F{travel_rate:.0f} X{bbox['min_x']:.3f} Y{bbox['min_y']:.3f} Z5.000",
        f"M109 S{nozzle_temperature:.0f}",
        f"M190 S{bed_temperature:.0f}",
    ]

    printed_layers = 0
    for layer in geometry["slicing"]["layers"]:
        paths = layer["closed_paths"] if layer["closed_paths"] else layer["open_paths"]
        if not paths:
            continue

        printed_layers += 1
        z = layer["z"]
        lines.append(f";LAYER:{layer['index']}")
        lines.append(f"G0 F{travel_rate:.0f} Z{z:.3f}")

        for path in paths:
            if len(path) < 2:
                continue
            start_x, start_y = path[0]
            lines.append(f"G0 F{travel_rate:.0f} X{start_x:.3f} Y{start_y:.3f}")
            for point in path[1:]:
                segment_length = distance_2d((start_x, start_y), point)
                extrusion_e += segment_length * extrusion_multiplier
                lines.append(
                    f"G1 F{print_rate:.0f} X{point[0]:.3f} Y{point[1]:.3f} E{extrusion_e:.5f}"
                )
                start_x, start_y = point

    lines.extend(
        [
            ";END",
            "M104 S0",
            "M140 S0",
            f"G0 F{travel_rate:.0f} Z{max(bbox['max_z'] + 10.0, 10.0):.3f}",
            "G92 E0",
            "M84",
        ]
    )

    if printed_layers == 0:
        raise ValueError("No printable paths were generated from the input mesh.")

    return "\n".join(lines) + "\n"


def cmd_inspect(args: argparse.Namespace) -> int:
    mesh = load_mesh(Path(args.input))
    payload = {
        "mesh": {
            "source_name": mesh.source_name,
            "source_format": mesh.source_format,
            "triangle_count": mesh.triangle_count,
            "vertex_count": mesh.vertex_count,
            "bounding_box": mesh.bounding_box(),
        }
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_slice_plan(args: argparse.Namespace) -> int:
    mesh = load_mesh(Path(args.input))
    payload = build_slice_plan(mesh, args.layer_height, args.first_layer_height)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_slice_gcode(args: argparse.Namespace) -> int:
    mesh = load_mesh(Path(args.input))
    gcode = generate_gcode(
        mesh=mesh,
        layer_height=args.layer_height,
        first_layer_height=args.first_layer_height,
        line_width=args.line_width,
        filament_diameter=args.filament_diameter,
        nozzle_temperature=args.nozzle_temperature,
        bed_temperature=args.bed_temperature,
        print_speed=args.print_speed,
        travel_speed=args.travel_speed,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(gcode, encoding="utf-8")
    payload = {
        "output": str(output_path.resolve()),
        "bytes": output_path.stat().st_size,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Swapmod native slicer prototype")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_cmd = subparsers.add_parser("inspect", help="Inspect a mesh source")
    inspect_cmd.add_argument("--input", required=True, help="Input STL or 3MF file")
    inspect_cmd.set_defaults(func=cmd_inspect)

    slice_cmd = subparsers.add_parser("slice-plan", help="Compute a layer-by-layer slice plan")
    slice_cmd.add_argument("--input", required=True, help="Input STL or 3MF file")
    slice_cmd.add_argument("--layer-height", type=float, required=True, help="Layer height in mm")
    slice_cmd.add_argument("--first-layer-height", type=float, help="First layer height in mm")
    slice_cmd.set_defaults(func=cmd_slice_plan)

    gcode_cmd = subparsers.add_parser("slice-gcode", help="Generate a first perimeter-only G-code")
    gcode_cmd.add_argument("--input", required=True, help="Input STL or 3MF file")
    gcode_cmd.add_argument("--output", required=True, help="Output G-code path")
    gcode_cmd.add_argument("--layer-height", type=float, required=True, help="Layer height in mm")
    gcode_cmd.add_argument("--first-layer-height", type=float, help="First layer height in mm")
    gcode_cmd.add_argument("--line-width", type=float, default=0.42, help="Extrusion line width in mm")
    gcode_cmd.add_argument("--filament-diameter", type=float, default=1.75, help="Filament diameter in mm")
    gcode_cmd.add_argument("--nozzle-temperature", type=float, default=220.0, help="Nozzle temperature in C")
    gcode_cmd.add_argument("--bed-temperature", type=float, default=60.0, help="Bed temperature in C")
    gcode_cmd.add_argument("--print-speed", type=float, default=35.0, help="Print speed in mm/s")
    gcode_cmd.add_argument("--travel-speed", type=float, default=180.0, help="Travel speed in mm/s")
    gcode_cmd.set_defaults(func=cmd_slice_gcode)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
