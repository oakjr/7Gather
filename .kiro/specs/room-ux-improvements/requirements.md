# Requirements Document

## Introduction

Este documento especifica melhorias de UX para o 7Gather — uma plataforma de colaboração espacial 2D. As melhorias abrangem: feedback visual nos controles de mídia, minimização de compartilhamento de tela, sistema de convite/chamada de participantes, persistência de status, indicador visual de status nos avatares, correções no sistema de travamento de sala e cor de piso, opção de cancelar alterações em configurações, e ajuste de renderização de portas.

## Glossary

- **Media_Controls**: Componente React de barra de ferramentas que exibe botões de alternância para microfone, câmera e compartilhamento de tela.
- **Toggle_Button**: Botão com dois estados visuais distintos (ativo/inativo) com feedback visual imediato ao usuário.
- **Screen_Share_Overlay**: Sobreposição de interface exibida quando outro participante compartilha sua tela no ambiente.
- **Participant_List**: Componente de sidebar que exibe todos os participantes presentes na sala com ações disponíveis.
- **Call_Notification**: Notificação gerada quando um participante é chamado para uma sala, contendo botão de navegação e tempo decorrido.
- **Status_Selector**: Componente que permite ao usuário definir seu status de disponibilidade (Disponível, Ocupado, Não Perturbe).
- **Status_Indicator**: Bolinha colorida exibida ao lado do avatar de cada participante no mapa, refletindo o status atual.
- **Floor_Color_System**: Sistema que aplica tint de cor personalizada aos tiles de piso de uma zona privada.
- **Room_Lock_System**: Sistema que tranca a zona privada do usuário, impedindo a entrada de outros participantes através das portas.
- **Lock_Indicator**: Indicador visual (cadeado) renderizado na entrada da sala trancada no mapa de tiles.
- **Settings_Menu**: Painel de configurações onde o usuário altera nome e avatar.
- **Door_Tile**: Tile no layer ObjectsTiles que representa uma porta, com estados aberto e fechado.
- **Private_Zone**: Área definida no mapa que cria um canal de áudio separado e pode ser personalizada pelo proprietário.
- **Colyseus_Server**: Servidor WebSocket que sincroniza estado da sala entre clientes conectados.
- **GameScene**: Cena principal do Phaser que renderiza o mapa, avatares e gerencia interações.

## Requirements

### Requirement 1: Toggle Visual nos Botões de Mídia

**User Story:** Como participante, quero que os botões de microfone, câmera e compartilhamento de tela tenham feedback visual de toggle claro, para que eu saiba imediatamente se o recurso está ativo ou inativo.

#### Acceptance Criteria

1. WHEN the user activates the microphone button (via click or keyboard), THE Media_Controls SHALL apply the `media-btn--on` class (active state: colored background, distinct active icon) or the `media-btn--off` class (inactive state: dimmed background, distinct inactive icon) and complete the CSS transition within 100ms.
2. WHEN the user activates the camera button (via click or keyboard), THE Media_Controls SHALL apply the `media-btn--on` class or the `media-btn--off` class and complete the CSS transition within 100ms.
3. WHEN the user activates the screen share button (via click or keyboard), THE Media_Controls SHALL apply the `media-btn--on` class or the `media-btn--off` class and complete the CSS transition within 100ms.
4. WHILE a media button is in active state, THE Media_Controls SHALL display the button with a visible colored border and a visually distinct icon such that the active and inactive states meet a minimum contrast ratio of 3:1 against each other per WCAG 1.4.11 (non-text contrast).
5. THE Media_Controls SHALL maintain the `aria-pressed` attribute synchronized with the visual toggle state for each button, set to `true` when active and `false` when inactive.
6. IF a media button's browser permission is denied, THEN THE Media_Controls SHALL display the button in a disabled state visually distinct from both active and inactive states, set the `disabled` attribute to `true`, and prevent toggle activation.

### Requirement 2: Minimizar Compartilhamento de Tela

**User Story:** Como participante, quero poder minimizar o overlay de compartilhamento de tela de outro usuário, para que eu possa acessar as funcionalidades da aplicação enquanto a tela está sendo compartilhada.

#### Acceptance Criteria

1. WHEN another participant is sharing their screen, THE Screen_Share_Overlay SHALL display a minimize button in the top-right corner of the overlay, with a minimum touch target of 32x32 pixels and an accessible label "Minimizar compartilhamento".
2. WHEN the user clicks the minimize button, THE Screen_Share_Overlay SHALL collapse within 300 milliseconds into a thumbnail of maximum 120x80 pixels positioned in the bottom-right corner of the viewport, displaying the live screen share video feed scaled to fit.
3. WHILE the Screen_Share_Overlay is minimized, THE GameScene SHALL remain fully interactive, allowing the user to move the avatar, open the sidebar, and access all application features without the thumbnail intercepting pointer events outside its bounds.
4. WHEN the user clicks the minimized thumbnail, THE Screen_Share_Overlay SHALL expand back to its original overlay dimensions within 300 milliseconds.
5. IF the sharing participant stops sharing while the overlay is minimized, THEN THE Screen_Share_Overlay SHALL remove the thumbnail within 500 milliseconds and restore the viewport to its state prior to the screen share (no overlay elements visible).
6. WHEN the user presses the Escape key while the Screen_Share_Overlay is displayed at full size, THE Screen_Share_Overlay SHALL minimize using the same behavior as clicking the minimize button.

### Requirement 3: Chamar Participante para a Sala

**User Story:** Como participante, quero poder chamar outra pessoa para a minha sala a partir da lista de participantes, para que ela receba uma notificação e possa se deslocar rapidamente até onde estou.

#### Acceptance Criteria

1. THE Participant_List SHALL display a poke icon button (👉) next to each participant entry except the current user's own entry.
2. WHEN the user clicks the poke button for a participant, THE Colyseus_Server SHALL deliver a call notification to the target participant within 1 second.
3. IF the target participant is disconnected or has left the room when the poke button is clicked, THEN THE Participant_List SHALL not send the call and SHALL display an inline error message indicating the participant is unavailable.
4. WHEN a call notification is received, THE Call_Notification SHALL display a toast notification containing: the caller's display name, a "Ir" (Go) button with a rocket icon (🚀), and the elapsed time since the call was made.
5. IF a new call notification is received while an existing Call_Notification is already visible, THEN THE Call_Notification SHALL stack the new notification below the existing one, displaying a maximum of 3 simultaneous call notifications and discarding the oldest if exceeded.
6. WHILE the Call_Notification is visible, THE Call_Notification SHALL update the elapsed time display every second (format: "Xm Ys atrás").
7. WHEN the called participant clicks the "Ir" button, THE GameScene SHALL navigate the participant's avatar to the caller's current tile position using pathfinding.
8. IF the caller leaves the room before the called participant responds, THEN THE Call_Notification SHALL display "Chamador saiu da sala" and disable the "Ir" button.
9. WHEN 60 seconds have elapsed since the call was made without the participant clicking "Ir", THE Call_Notification SHALL automatically dismiss.

### Requirement 4: Persistir Status do Usuário

**User Story:** Como participante, quero que meu status selecionado seja persistido entre sessões, para que eu não precise reconfigurá-lo toda vez que abro a aplicação.

#### Acceptance Criteria

1. WHEN the user selects a status in the Status_Selector, THE Status_Selector SHALL persist the selection to localStorage under the key "user_status", storing one of the valid values: "available", "busy", or "dnd".
2. WHEN the Status_Selector component mounts, THE Status_Selector SHALL read the persisted status from localStorage key "user_status" and, if the value is one of "available", "busy", or "dnd", set it as the initial displayed status.
3. IF no persisted status exists in localStorage OR the persisted value is not one of "available", "busy", or "dnd", THEN THE Status_Selector SHALL default to "available" and persist "available" to localStorage.
4. WHEN the user changes the status, THE Colyseus_Server SHALL broadcast the updated status to all connected participants in the same room within 500ms measured from the moment the server receives the status change message.
5. IF localStorage is unavailable or the write operation fails, THEN THE Status_Selector SHALL still update the in-memory status and notify the Colyseus_Server, without displaying an error to the user.

### Requirement 5: Indicador de Status no Avatar

**User Story:** Como participante, quero ver uma bolinha colorida de status ao lado do avatar de cada pessoa no mapa, para que eu identifique rapidamente a disponibilidade de cada colega.

#### Acceptance Criteria

1. THE GameScene SHALL render a filled circular status indicator of 8 game-pixels diameter, positioned with its center offset 8 pixels to the right and 8 pixels below the center of each avatar sprite (both local and remote) on the map.
2. WHEN a participant's status is "available", THE Status_Indicator SHALL display the color green (#4cdf8b).
3. WHEN a participant's status is "busy", THE Status_Indicator SHALL display the color yellow (#ffb347).
4. WHEN a participant's status is "dnd", THE Status_Indicator SHALL display the color red (#ff6b6b).
5. WHEN a participant's status changes on the server, THE Status_Indicator SHALL update on all connected clients within the next Colyseus state synchronization cycle (at the configured SYNC_RATE).
6. THE Status_Indicator SHALL render at depth 12 (above avatar sprites at depth 10 and name labels at depth 11) to remain visible at all times.
7. IF a participant has no status set, THEN THE Status_Indicator SHALL default to displaying the "available" color (#4cdf8b).
8. WHILE the avatar sprite moves, THE Status_Indicator SHALL maintain its relative offset position to the avatar sprite on every frame update.

### Requirement 6: Corrigir Aplicação de Cor do Piso

**User Story:** Como proprietário de sala, quero que a cor do piso da minha sala privada seja aplicada corretamente quando eu a seleciono, para personalizar meu espaço.

#### Acceptance Criteria

1. WHEN the user selects a color in the Floor_Color_Picker, THE Floor_Color_System SHALL send the `set_floor_color` message to the Colyseus_Server with the selected color index (integer in range 0 to 17).
2. WHEN the Colyseus_Server receives a `set_floor_color` message from the zone owner, THE Colyseus_Server SHALL update the zone's `floorColorIndex` property in the RoomState to the received color index.
3. WHEN the zone's `floorColorIndex` changes in the state, THE GameScene SHALL apply the corresponding hex color tint to all floor tiles (tile index 10) within the zone bounds on the Ground layer exclusively, not on the Physics layer or any other layer.
4. IF the Colyseus_Server receives a `set_floor_color` message from a user who is not the owner of the target zone, THEN THE Colyseus_Server SHALL reject the message and leave the zone's `floorColorIndex` unchanged.
5. WHEN the floor color is applied, THE Floor_Color_System SHALL produce a visible color change on the zone floor tiles within 500ms of the user selecting the color.
6. IF the `set_floor_color` message contains a color index outside the valid range (less than 0 or greater than 17), THEN THE Colyseus_Server SHALL reject the message and leave the zone's `floorColorIndex` unchanged.

### Requirement 7: Corrigir Sistema de Travamento de Sala

**User Story:** Como proprietário de sala, quero que o cadeado funcione corretamente (com animação de toggle, ícone na entrada da sala e bloqueio efetivo de entrada), para garantir minha privacidade.

#### Acceptance Criteria

1. WHEN the user clicks the PadlockIcon, THE Room_Lock_System SHALL send a `lock_room` (if currently unlocked) or `unlock_room` (if currently locked) message including the `zoneId` to the Colyseus_Server within 500ms of the click event.
2. WHEN the Colyseus_Server receives a `lock_room` or `unlock_room` message from the zone owner, THE Colyseus_Server SHALL update the zone's `isLocked` property in the RoomState. IF the sender is not the zone's `ownerSessionId`, THEN THE Colyseus_Server SHALL discard the message without modifying state and without sending an error response.
3. WHEN the zone's `isLocked` changes to true, THE PadlockIcon SHALL switch from the unlocked SVG (color #888888) to the locked SVG (color #FF4444) within a single React render cycle (under 100ms perceived by the user).
4. WHEN the zone's `isLocked` changes to false, THE PadlockIcon SHALL switch from the locked SVG (color #FF4444) to the unlocked SVG (color #888888) within a single React render cycle (under 100ms perceived by the user).
5. WHEN a zone's `isLocked` changes to true, THE GameScene SHALL render a Lock_Indicator graphic (semi-transparent red overlay with padlock shape at depth 6) on each door tile adjacent to the zone bounds (within 1 tile of the zone perimeter on X or Y edge).
6. WHILE a zone is locked, THE DoorAnimationSystem SHALL keep all doors adjacent to the locked zone in the closed state (using `closedIndex`), mark those door positions as collision tiles via `setLockedDoor`, and ignore proximity-based open triggers for those doors.
7. WHEN a non-owner avatar attempts to move into a tile position inside a locked zone, THE Colyseus_Server SHALL reject the move message (preserve previous position) and send a `room_locked` notification with the `zoneId` to the rejected client.
8. WHILE a zone is locked, IF the zone owner's avatar moves into the locked zone's tile area, THEN THE Colyseus_Server SHALL accept the move and update position normally (owner bypass).
9. WHEN the zone's `isLocked` changes to false, THE GameScene SHALL destroy all Lock_Indicator graphics for that zone AND THE DoorAnimationSystem SHALL call `clearLockedDoor` on all adjacent door positions and restore normal proximity-based door open/close behavior (Manhattan distance ≤1 to open, >2 to close).
10. WHEN a client joins or reconnects to a room where one or more zones have `isLocked` set to true, THE GameScene SHALL render Lock_Indicator graphics and THE DoorAnimationSystem SHALL apply locked-door collision state for each pre-locked zone upon receiving the initial state snapshot (via `bindRoomState` `onAdd` callback), before the first frame where the user can move.

### Requirement 8: Redefinir Sala Remove Trava e Cor

**User Story:** Como proprietário de sala, quero que ao redefinir minha sala, ela volte ao estado padrão (destrancada e com cor de piso padrão), para não herdar configurações anteriores.

#### Acceptance Criteria

1. WHEN the owner sends a `release_room` message with a valid `zoneId`, THE Colyseus_Server SHALL set the zone's `isLocked` property to false.
2. WHEN the owner sends a `release_room` message with a valid `zoneId`, THE Colyseus_Server SHALL set the zone's `floorColorIndex` property to -1 (no tint).
3. WHEN the owner sends a `release_room` message with a valid `zoneId`, THE Colyseus_Server SHALL set the zone's `ownerSessionId` to an empty string, releasing ownership.
4. THE Colyseus_Server SHALL process the room reset as a single atomic operation, updating `isLocked`, `floorColorIndex`, and `ownerSessionId` in one state change batch before the next patch interval.
5. WHEN the zone state properties `isLocked` and `floorColorIndex` are updated to defaults via Colyseus state sync, THE GameScene SHALL remove any Lock_Indicator graphics and clear the floor color tint within 500ms of receiving the state delta.
6. IF a client that is not the zone's current owner sends a `release_room` message, THEN THE Colyseus_Server SHALL ignore the message and make no state changes to the zone.

### Requirement 9: Botão Cancelar em Configurações

**User Story:** Como participante, quero ter a opção de cancelar alterações feitas no menu de configurações, para poder desistir de mudanças antes de salvá-las.

#### Acceptance Criteria

1. WHILE the settings panel is open, THE Settings_Menu SHALL display a "Cancelar" button positioned to the left of the "Salvar e Reentrar" button within the same button row.
2. WHEN the user clicks "Cancelar", THE Settings_Menu SHALL revert the name field and avatar selection to the values they held when the settings panel was opened.
3. WHEN the user clicks "Cancelar", THE Settings_Menu SHALL close the settings panel without persisting any changes to localStorage or triggering a page reload.
4. WHILE no changes have been made to the form fields (name and avatar selection match the values from when the panel was opened), THE Settings_Menu SHALL display the "Cancelar" button in a disabled state with reduced opacity (visually distinct from the enabled state).
5. WHEN the user modifies a form field and then manually reverts it to match the original value, THE Settings_Menu SHALL return the "Cancelar" button to the disabled state.

### Requirement 10: Corrigir Renderização de Portas

**User Story:** Como participante, quero que as portas nas entradas das salas sejam renderizadas corretamente (portas simples, rotacionadas 90° nas paredes leste e oeste), para uma aparência visual coerente.

#### Acceptance Criteria

1. THE generate-tileset.js script SHALL produce closed-door and open-door tile sprites that depict a single-door panel (one panel occupying the full 32x32 tile area) instead of the current double-door sprites (two panels meeting at center).
2. WHEN the generate-map.js script places a door tile on a west or east wall, THE script SHALL write the tile data with a 90-degree clockwise rotation flag (Tiled flipped-diagonal bit) so that the door sprite aligns vertically with the wall orientation.
3. WHEN the generate-map.js script places a door tile on a north or south wall, THE script SHALL write the tile data with no rotation flags (0 degrees, default horizontal orientation).
4. WHEN the map is loaded, THE TiledMapManager SHALL render door tiles on the ObjectsTiles layer using the rotation flags encoded in the tile data, resulting in east/west doors appearing rotated 90 degrees and north/south doors appearing at default orientation.
5. WHEN two adjacent door tiles are placed in a 2-tile-wide doorway, THE generate-map.js script SHALL position each door tile within its own 32x32 grid cell with no pixel overlap between the two adjacent door tiles.
6. IF the tileset PNG is regenerated, THEN the generate-tileset.js script SHALL produce single-door closed (tile index 15) and single-door open (tile index 16) sprites that each fit within exactly one 32x32 pixel tile slot in the 256x256 tileset image.
