// Drox IDE — chrome wizard Inno 6.6+ (dark natif + faisceau + grille 3x3).
// BMP : resources/win32/inno-*.bmp via sync-drox-inno-wizard.ps1 (couleurs opaques uniquement).

const
  DroxBg = $001E1E1E;
  DroxGreen = $003D7A3D;
  DroxGreenGlow = $005A9E5A;
  DroxFg = $00DCDCDC;
  DroxBeamPeriodMs = 620;
  DroxBeamTimerMs = 16;

var
  DroxBeamPhase: Extended;
  DroxBeamTimerId: LongWord;
  DroxBeamStrip: TBitmapImage;
  DroxActivityHost: TPanel;
  DroxActivityCells: array[0..8] of TPanel;
  DroxActivityTick: Integer;

function SetTimer(hWnd: LongWord; nIDEvent, uElapse: LongWord; lpTimerFunc: LongWord): LongWord;
  external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd: LongWord; nIDEvent: LongWord): LongWord;
  external 'KillTimer@user32.dll stdcall';

procedure DroxRedrawBeam; forward;
procedure DroxLayoutBeam; forward;
procedure DroxLayoutActivityGrid; forward;

procedure DroxStopWizardTheme;
begin
  if DroxBeamTimerId <> 0 then begin
    KillTimer(0, DroxBeamTimerId);
    DroxBeamTimerId := 0;
  end;
end;

procedure DroxHideBevelsRecursive(Parent: TWinControl);
var
  I: Integer;
  C: TControl;
begin
  if Parent = nil then Exit;
  for I := 0 to Parent.ControlCount - 1 do begin
    C := Parent.Controls[I];
    if C is TBevel then
      TBevel(C).Visible := False
    else if C is TWinControl then
      DroxHideBevelsRecursive(TWinControl(C));
  end;
end;

procedure DroxApplyWizardChrome;
begin
  WizardForm.Color := DroxBg;
  if Assigned(WizardForm.MainPanel) then begin
    WizardForm.MainPanel.Color := DroxBg;
    WizardForm.MainPanel.BevelOuter := bvNone;
    WizardForm.MainPanel.BevelInner := bvNone;
    WizardForm.MainPanel.ParentColor := False;
  end;
  DroxHideBevelsRecursive(WizardForm);
  // Logo haut-droite : doublon + ancien cadre vert BMP — on masque (panneau gauche suffit)
  if Assigned(WizardForm.WizardSmallBitmapImage) then
    WizardForm.WizardSmallBitmapImage.Visible := False;
end;

procedure DroxRedrawBeam;
var
  W, H, BeamH, BeamY, I, Alpha: Integer;
  Bmp: TBitmap;
  PenColor: LongWord;
begin
  if DroxBeamStrip = nil then Exit;
  W := DroxBeamStrip.Width;
  H := DroxBeamStrip.Height;
  if (W <= 0) or (H <= 0) then Exit;

  Bmp := DroxBeamStrip.Bitmap;
  Bmp.Width := W;
  Bmp.Height := H;
  Bmp.Canvas.Brush.Color := DroxBg;
  Bmp.Canvas.Rectangle(0, 0, W, H);

  BeamH := Round(H * 0.38);
  if BeamH < ScaleY(10) then BeamH := ScaleY(10);
  BeamY := Round(DroxBeamPhase * (H + BeamH)) - BeamH;

  Bmp.Canvas.Pen.Width := 1;
  for I := 0 to H - 1 do begin
    if (I < BeamY) or (I > BeamY + BeamH) then Continue;
    Alpha := 255;
    if (I < BeamY + BeamH div 5) or (I > BeamY + (BeamH * 4) div 5) then
      Alpha := 140;
    if Alpha >= 200 then
      PenColor := DroxGreen
    else
      PenColor := DroxGreenGlow;
    Bmp.Canvas.Pen.Color := PenColor;
    Bmp.Canvas.MoveTo(W div 2, I);
    Bmp.Canvas.LineTo(W div 2, I);
  end;
end;

procedure DroxBeamTimerProc(H: LongWord; Msg: LongWord; IdEvent: LongWord; Time: LongWord);
begin
  DroxBeamPhase := DroxBeamPhase + (DroxBeamTimerMs / DroxBeamPeriodMs);
  if DroxBeamPhase >= 1 then DroxBeamPhase := DroxBeamPhase - 1;
  DroxRedrawBeam;
  DroxActivityTick := DroxActivityTick + 1;
  if (DroxActivityTick mod 4) = 0 then
    DroxLayoutActivityGrid;
end;

procedure DroxLayoutBeam;
var
  HostLeft, HostTop, HostH: Integer;
begin
  if DroxBeamStrip = nil then Exit;
  HostLeft := WizardForm.InnerPage.Left;
  HostTop := WizardForm.MainPanel.Top;
  HostH := WizardForm.ClientHeight - HostTop - ScaleY(52);
  if HostH < ScaleY(40) then HostH := ScaleY(40);

  DroxBeamStrip.Left := HostLeft - ScaleX(2);
  DroxBeamStrip.Top := HostTop;
  DroxBeamStrip.Height := HostH;
  DroxBeamStrip.Width := ScaleX(3);
  DroxRedrawBeam;
end;

procedure DroxLayoutActivityGrid;
var
  I, Delay, Phase: Integer;
  HostLeft, HostTop: Integer;
  CellColor: LongWord;
begin
  if DroxActivityHost = nil then Exit;
  HostLeft := WizardForm.InnerPage.Left + ScaleX(8);
  HostTop := WizardForm.MainPanel.Top + ScaleY(6);
  DroxActivityHost.Left := HostLeft;
  DroxActivityHost.Top := HostTop;
  DroxActivityHost.Width := ScaleX(14);
  DroxActivityHost.Height := ScaleY(14);

  for I := 0 to 8 do begin
    Delay := (I mod 3) + (I div 3) * 3;
    Phase := (DroxActivityTick + Delay) mod 12;
    if Phase < 4 then
      CellColor := DroxGreen
    else if Phase < 8 then
      CellColor := DroxGreenGlow
    else
      CellColor := $00424242;
    DroxActivityCells[I].Color := CellColor;
  end;
end;

procedure DroxCreateActivityGrid;
var
  I, Row, Col: Integer;
  Cell: TPanel;
begin
  DroxActivityHost := TPanel.Create(WizardForm);
  DroxActivityHost.Parent := WizardForm;
  DroxActivityHost.Color := DroxBg;
  DroxActivityHost.BevelOuter := bvNone;
  DroxActivityHost.BevelInner := bvNone;
  DroxActivityHost.Caption := '';
  DroxActivityHost.ShowHint := False;

  for I := 0 to 8 do begin
    Row := I div 3;
    Col := I mod 3;
    Cell := TPanel.Create(DroxActivityHost);
    Cell.Parent := DroxActivityHost;
    Cell.BevelOuter := bvNone;
    Cell.BevelInner := bvNone;
    Cell.Caption := '';
    Cell.Left := Col * ScaleX(4);
    Cell.Top := Row * ScaleY(4);
    Cell.Width := ScaleX(3);
    Cell.Height := ScaleY(3);
    Cell.Color := DroxGreenGlow;
    DroxActivityCells[I] := Cell;
  end;
  DroxActivityTick := 0;
  DroxLayoutActivityGrid;
end;

procedure DroxCreateBeamStrip;
begin
  DroxBeamStrip := TBitmapImage.Create(WizardForm);
  DroxBeamStrip.Parent := WizardForm;
  DroxBeamStrip.Stretch := True;
  DroxBeamStrip.BackColor := clNone;
  DroxBeamStrip.AutoSize := False;
  DroxBeamStrip.Bitmap.Width := ScaleX(3);
  DroxBeamStrip.Bitmap.Height := ScaleY(120);
  DroxBeamStrip.BringToFront;
end;

procedure DroxStartBeamTimer;
begin
  DroxStopWizardTheme;
  DroxBeamPhase := 0;
  DroxBeamTimerId := SetTimer(0, 0, DroxBeamTimerMs, CreateCallback(@DroxBeamTimerProc));
end;

procedure DroxInitializeWizardTheme;
begin
  DroxApplyWizardChrome;
  DroxCreateBeamStrip;
  DroxCreateActivityGrid;
  DroxLayoutBeam;
  DroxStartBeamTimer;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  DroxApplyWizardChrome;
  DroxLayoutBeam;
  DroxLayoutActivityGrid;
end;

procedure InitializeWizard;
begin
  DroxInitializeWizardTheme;
end;

procedure DeinitializeSetup;
begin
  DroxStopWizardTheme;
end;
