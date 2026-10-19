#ifndef RD_TOUCH_LAYOUT_H
#define RD_TOUCH_LAYOUT_H

#include <SDL.h>
#include "input.h"

/* All dimensions are renderer pixels. Fit the largest centered 4:3 frame
 * into the display. Buttons use the natural side gutters where available,
 * and overlay the frame on narrower screens without shrinking the game. */
static inline void rd_get_touch_layout(int width, int height, SDL_Rect *game,
                                       SDL_Rect buttons[kNumElements])
{
    int size = SDL_max(1, SDL_min(height * 20 / 100, width * 10 / 100));
    int drive_height = size * 13 / 10;
    int weapon_height = size * 9 / 10;
    int gap = SDL_max(1, size / 9);
    int margin = SDL_max(1, size / 7);
    int overlap = size / 5;
    int cluster_width = size * 2 + gap;
    int game_width = SDL_min(width, height * 4 / 3);
    int game_height = game_width * 3 / 4;
    int left, right, bottom;

    *game = (SDL_Rect){(width - game_width) / 2, (height - game_height) / 2,
                       game_width, game_height};
    for (int i = 0; i < kNumElements; i++)
        buttons[i] = (SDL_Rect){0, 0, 0, 0};

    left = SDL_max(margin, game->x + overlap - cluster_width);
    right = SDL_min(width - margin - cluster_width,
                    game->x + game->w - overlap);
    bottom = height - margin - drive_height;
    buttons[kLeft] = (SDL_Rect){left, bottom, size, drive_height};
    buttons[kRight] = (SDL_Rect){left + size + gap, bottom, size, drive_height};
    buttons[kFire] = (SDL_Rect){right, bottom - weapon_height - gap, size, weapon_height};
    buttons[kMissile] = (SDL_Rect){right + size + gap, bottom - weapon_height - gap, size, weapon_height};
    buttons[kBrake] = (SDL_Rect){right, bottom, size, drive_height};
    buttons[kForward] = (SDL_Rect){right + size + gap, bottom, size, drive_height};
    /* Preserve lua-dev's pause control, using the same visible/hit rectangle. */
    int pause_size = SDL_max(40, size * 3 / 4);
    buttons[kPause] = (SDL_Rect){right + cluster_width - pause_size, margin,
                                pause_size, pause_size};
}

static inline int rd_touch_keymask(float nx, float ny, int width, int height,
                                   const SDL_Rect buttons[kNumElements])
{
    SDL_Point point;
    if (nx < 0.0f || ny < 0.0f || nx >= 1.0f || ny >= 1.0f)
        return 0;
    point = (SDL_Point){(int)(nx * width), (int)(ny * height)};
    for (int i = 0; i < kNumElements; i++)
        if (SDL_PointInRect(&point, &buttons[i]))
            return 1 << i;
    return 0;
}

#endif
