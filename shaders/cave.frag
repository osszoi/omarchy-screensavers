#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 grid;
    vec4 rockColor;
    vec4 faceColor;
    vec4 floorColor;
};

// r: rock, g: pool
layout(binding = 1) uniform sampler2D walls;
layout(binding = 2) uniform sampler2D lights;
layout(binding = 3) uniform sampler2D biomes;

vec2 terrainAt(vec2 uv) {
    vec2 t = 1.0 / grid;
    vec2 d = texture(walls, uv).rg * 0.36;
    d += texture(walls, uv + vec2(t.x, 0.0)).rg * 0.16;
    d += texture(walls, uv - vec2(t.x, 0.0)).rg * 0.16;
    d += texture(walls, uv + vec2(0.0, t.y)).rg * 0.16;
    d += texture(walls, uv - vec2(0.0, t.y)).rg * 0.16;
    return d;
}

float grain(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec2 terrain = terrainAt(uv);
    float rock = smoothstep(0.47, 0.53, terrain.x);
    float depth = smoothstep(0.5, 0.98, terrain.x);
    float pool = smoothstep(0.42, 0.58, terrain.y);
    float shore = smoothstep(0.18, 0.5, terrain.y) * (1.0 - pool);

    // soft shoulder, so overlapping lights blend instead of clipping to a flat patch
    vec3 light = 1.0 - exp(-texture(lights, uv).rgb * 2.0 * 1.25);
    vec3 tint = texture(biomes, uv).rgb;

    vec3 open = floorColor.rgb + tint * 0.1 + light;
    // the cave floor darkens a little right under the walls
    open *= mix(1.0, 0.7, smoothstep(0.22, 0.5, terrain.x));
    vec3 liquid = tint * 0.4 + light * 0.75;
    open = mix(open, liquid, pool) + tint * shore * 0.2;

    vec3 face = faceColor.rgb + tint * 0.17 + light * 0.7;
    vec3 wall = mix(face, rockColor.rgb + tint * 0.02, depth);

    vec3 color = mix(open, wall, rock);
    color += (grain(floor(uv * grid * 8.0)) - 0.5) * 0.012;
    fragColor = vec4(color, 1.0) * qt_Opacity;
}
