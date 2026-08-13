#ifndef __GAMEFRAME
#define __GAMEFRAME

extern int gEndGame;

void InitFrameCount();
void GameLoopTick();
void GameFrame();
void PauseFrameCount();
void ResumeFrameCount();

#endif
