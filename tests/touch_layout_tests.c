#include <stdio.h>
#include <stdlib.h>
#include "platform/touch_layout.h"

#define CHECK(condition) do { if (!(condition)) { \
    fprintf(stderr, "%dx%d: line %d: %s\n", width, height, __LINE__, #condition); \
    exit(1); } } while (0)

static void check_layout(int width, int height)
{
    const int keys[] = {kLeft, kRight, kFire, kMissile, kBrake, kForward, kPause};
    SDL_Rect game, buttons[kNumElements];
    rd_get_touch_layout(width, height, &game, buttons);
    CHECK(abs(game.w * 3 - game.h * 4) <= 3);
    /* Controls must never reduce the available game frame. */
    CHECK(game.w == width || height - game.h <= 1);
    CHECK(game.x >= 0 && game.y >= 0);
    CHECK(game.x + game.w <= width && game.y + game.h <= height);
    CHECK(abs(game.x * 2 + game.w - width) <= 1);
    CHECK(abs(game.y * 2 + game.h - height) <= 1);
    for (int i = 0; i < 7; i++)
    {
        SDL_Rect button = buttons[keys[i]];
        CHECK(button.x > 0 && button.y > 0);
        CHECK(button.x + button.w < width && button.y + button.h < height);
        CHECK(button.w >= 40 && button.h >= 40);
        CHECK(rd_touch_keymask((button.x + button.w / 2.0f) / width,
                               (button.y + button.h / 2.0f) / height,
                               width, height, buttons) == (1 << keys[i]));
        for (int j = i + 1; j < 7; j++)
            CHECK(!SDL_HasIntersection(&button, &buttons[keys[j]]));
    }
    CHECK(rd_touch_keymask(0.5f, 0.5f, width, height, buttons) == 0);
    CHECK(rd_touch_keymask(-0.1f, 0.9f, width, height, buttons) == 0);
    CHECK(rd_touch_keymask(1.0f, 0.9f, width, height, buttons) == 0);
    /* The gap between steering buttons must stay neutral. */
    CHECK(rd_touch_keymask((buttons[kLeft].x + buttons[kLeft].w + 1.0f) / width,
                           (buttons[kLeft].y + 1.0f) / height,
                           width, height, buttons) == 0);
}

int main(void)
{
    const int sizes[][2] = {
        {640, 360}, {800, 480}, {1280, 720}, {1920, 1080},
        {2340, 1080}, {2400, 1080}, {2560, 1080}, {1024, 768}, {1280, 800}
    };
    for (unsigned int i = 0; i < sizeof(sizes) / sizeof(sizes[0]); i++)
        check_layout(sizes[i][0], sizes[i][1]);
    puts("Touch layout: nine landscape sizes passed");
    return 0;
}
