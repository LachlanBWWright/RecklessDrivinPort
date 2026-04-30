#ifndef __GAMEINITEXIT
#define __GAMEINITEXIT

extern int gLevelID;
extern int gGameOn;
extern int gPlayerCarID;

typedef struct{
	int enabled;
	int levelID;
	int hasStartY;
	int startY;
	int hasObjectGroupStartY;
	int objectGroupStartY;
	UInt32 forcedAddOns;
	UInt32 disabledBonusRollMask;
} tEditorLaunchOptions;

extern tEditorLaunchOptions gEditorLaunchOptions;

void DisposeLevel();
void StartGame(int);
int LoadLevel();
void EndGame();
void ResetEditorLaunchOptions(void);
void SetEditorLaunchOptions(const tEditorLaunchOptions *options);
void rd_set_editor_launch_options(int levelID,int hasStartY,int startY,
	int hasObjectGroupStartY,int objectGroupStartY,
	UInt32 forcedAddOns,UInt32 disabledBonusRollMask);
void rd_start_editor_test_drive(void);

#endif