#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 grid;
    float rise;
    vec4 shallowColor;
    vec4 deepColor;
    vec4 riverColor;
};

// r: water, g: river
layout(binding = 1) uniform sampler2D shape;
// r: height of the land, g: depth of the water
layout(binding = 2) uniform sampler2D relief;
layout(binding = 3) uniform sampler2D cover;

vec2 shapeAt(vec2 uv) {
    vec2 t = 1.0 / grid;
    vec2 s = texture(shape, uv).rg * 0.36;
    s += texture(shape, uv + vec2(t.x, 0.0)).rg * 0.16;
    s += texture(shape, uv - vec2(t.x, 0.0)).rg * 0.16;
    s += texture(shape, uv + vec2(0.0, t.y)).rg * 0.16;
    s += texture(shape, uv - vec2(0.0, t.y)).rg * 0.16;
    return s;
}

// the land comes up out of the plain as `rise` grows
float heightAt(vec2 uv) {
    return min(texture(relief, uv).r, rise);
}

float grain(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float soft(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(grain(i), grain(i + vec2(1.0, 0.0)), u.x), mix(grain(i + vec2(0.0, 1.0)), grain(i + vec2(1.0, 1.0)), u.x), u.y);
}

// moonlight: colours lose some of their saturation and lean blue, everything gets darker
vec3 night(vec3 c) {
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), c, 0.72) * vec3(0.4, 0.5, 0.8) * 0.66;
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec2 t = 1.0 / grid;
    vec2 s = shapeAt(uv);
    float water = smoothstep(0.46, 0.54, s.x);

    float slopeX = heightAt(uv + vec2(t.x, 0.0)) - heightAt(uv - vec2(t.x, 0.0));
    float slopeY = heightAt(uv + vec2(0.0, t.y)) - heightAt(uv - vec2(0.0, t.y));
    // lit from the top left
    float shade = clamp(1.0 + (slopeX + slopeY) * 3.2, 0.5, 1.55);

    // the cover is looked up a little off to the side, differently everywhere, so the edges
    // between biomes wander instead of following the grid
    vec2 drift = (vec2(soft(uv * grid * 0.3), soft(uv * grid * 0.3 + 31.7)) - 0.5) * 1.8 / grid;
    vec3 land = texture(cover, uv + drift).rgb;
    // woods read as a stipple of darker crowns
    float wood = clamp((land.g - max(land.r, land.b)) * 5.0, 0.0, 1.0) * (1.0 - smoothstep(0.34, 0.6, land.g));
    land *= 1.0 - wood * 0.26 * step(0.5, grain(floor(uv * grid * 2.0)));
    land *= shade;
    // bare ground stays black until the land starts to rise
    land *= smoothstep(0.0, 0.3, rise);

    float depth = texture(relief, uv).g;
    vec3 sea = mix(shallowColor.rgb, deepColor.rgb, smoothstep(0.05, 0.85, depth));

    vec3 color = mix(land, sea, water);
    float river = smoothstep(0.28, 0.6, s.y) * (1.0 - water);
    color = mix(color, riverColor.rgb, river * 0.9);

    // a thin dark shoreline keeps land and water apart
    float coast = 1.0 - abs(s.x - 0.5) * 2.0;
    color *= 1.0 - smoothstep(0.72, 1.0, coast) * 0.3;
    color = night(color);
    color += (grain(floor(uv * grid * 6.0)) - 0.5) * 0.01;
    fragColor = vec4(color, 1.0) * qt_Opacity;
}
