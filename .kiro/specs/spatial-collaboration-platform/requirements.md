# Requirements Document

## Introduction

Esta especificação define os requisitos para uma plataforma de escritório virtual 2D com navegação espacial, auto-hospedada, projetada como alternativa privada ao Gather Town. O objetivo é fornecer um MVP funcional para colaboração local em equipe, com soberania de dados e custo zero de licenciamento. A plataforma replica a espontaneidade de um escritório físico onde o áudio é compartilhado por sala, vídeo e tela são compartilhados por opção do usuário, e os avatares navegam livremente sem colisão entre si. A infraestrutura permite deploy local via Docker para testes e deploy público futuro para uso organizacional com múltiplas salas por equipe.

## Glossary

- **Plataforma**: O sistema de escritório virtual 2D completo, incluindo cliente web e servidores de backend
- **Avatar**: Representação visual 2D do usuário no mapa, selecionada entre 20 modelos pré-renderizados
- **Mapa_Espacial**: Grade 2D baseada em tiles (16x16 ou 32x32 pixels) onde os avatares navegam
- **Motor_de_Renderização**: Componente Phaser 3 responsável pela renderização do mapa e movimentação dos avatares
- **Servidor_de_Estado**: Componente Colyseus responsável pela sincronização de estado entre clientes via WebSocket
- **Servidor_de_Mídia**: Componente LiveKit SFU responsável pelo gerenciamento de faixas de áudio, vídeo e compartilhamento de tela
- **Sala**: Instância isolada da plataforma com seu próprio mapa, participantes e canais de mídia, acessível via link único
- **Zona_Privada**: Área delimitada no mapa que garante isolamento acústico total entre usuários internos e externos
- **Bounding_Box**: Região retangular ao redor do avatar usada para determinar visibilidade
- **Elemento_Interativo**: Objeto no mapa que, ao ser ativado, renderiza conteúdo externo via iframe (escopo futuro)
- **SFU**: Selective Forwarding Unit — topologia WebRTC onde o cliente envia um único stream ao servidor que redistribui
- **Delta_Binário**: Pacote compacto contendo apenas as mudanças de estado transmitidas via WebSocket
- **Simulcast**: Técnica que envia múltiplas qualidades do mesmo stream para adaptação dinâmica de banda
- **TURN_Relay**: Servidor intermediário usado quando conexão peer-to-peer direta não é possível
- **MOS**: Mean Opinion Score — métrica de qualidade de áudio/vídeo (escala 1-5)
- **Música_Compartilhada**: Funcionalidade que permite a um usuário transmitir áudio de música para todos os participantes da sala

## Requirements

### Requirement 1: Navegação Espacial do Avatar

**User Story:** Como usuário, eu quero mover meu avatar pelo mapa 2D usando teclado, para que eu possa navegar pelo escritório virtual e ver onde meus colegas estão.

#### Acceptance Criteria

1. WHEN o usuário pressiona uma tecla direcional (setas ou WASD), THE Motor_de_Renderização SHALL mover o avatar na direção correspondente a uma velocidade de 4 tiles por segundo, com resposta visual em no máximo 100ms após o pressionamento da tecla
2. WHILE o avatar se move, THE Motor_de_Renderização SHALL verificar colisões apenas com paredes e objetos fixos (camada Physics) e permitir passagem livre através de outros avatares
3. WHEN o avatar se move para uma nova posição, THE Servidor_de_Estado SHALL transmitir a posição atualizada para todos os clientes conectados à mesma Sala via Delta_Binário em no máximo 200ms após a mudança de posição local
4. THE Plataforma SHALL persistir o ID numérico do avatar (1-20) no LocalStorage do navegador para manter consistência visual entre sessões
5. IF a conexão WebSocket com o Servidor_de_Estado for perdida durante a movimentação, THEN THE Motor_de_Renderização SHALL permitir movimentação local contínua e enfileirar as atualizações de posição para reenvio quando a conexão for restabelecida em até 5 segundos, ou exibir indicação visual de desconexão caso o tempo exceda 5 segundos

### Requirement 2: Áudio Compartilhado por Sala

**User Story:** Como usuário, eu quero que o áudio seja compartilhado automaticamente com todos na mesma sala ao entrar, para que eu possa conversar com colegas sem configuração adicional.

#### Acceptance Criteria

1. WHEN um usuário entra em uma Sala, THE Servidor_de_Mídia SHALL solicitar permissão de microfone ao navegador e, após concessão, conectar o áudio do usuário ao canal de áudio compartilhado da Sala em no máximo 3 segundos
2. WHILE o usuário está conectado à Sala, THE Servidor_de_Mídia SHALL transmitir o áudio do usuário para todos os outros participantes da mesma Sala com latência máxima de 200ms entre origem e destino
3. WHEN um usuário sai da Sala ou fecha o navegador, THE Servidor_de_Mídia SHALL desconectar o áudio do usuário do canal compartilhado em no máximo 2 segundos, cessando a transmissão para os demais participantes
4. WHEN o usuário clica no botão de mute, THE Plataforma SHALL interromper o envio da faixa de áudio do microfone ao Servidor_de_Mídia e exibir um indicador visual de microfone silenciado no avatar do usuário
5. IF o usuário negar a permissão de microfone do navegador, THEN THE Plataforma SHALL conectar o usuário à Sala em modo somente escuta, permitindo receber áudio dos demais participantes, e exibir indicação de que o microfone está indisponível
6. IF a conexão de áudio com o Servidor_de_Mídia falhar após a entrada na Sala, THEN THE Plataforma SHALL exibir uma notificação de erro ao usuário e tentar reconexão automática a cada 5 segundos por no máximo 3 tentativas

### Requirement 3: Vídeo e Compartilhamento de Tela por Opção

**User Story:** Como usuário, eu quero ativar meu vídeo ou compartilhar minha tela apenas quando eu decidir, para que eu tenha controle sobre quando exponho minha câmera ou conteúdo visual.

#### Acceptance Criteria

1. WHEN o usuário clica no botão de vídeo, THE Servidor_de_Mídia SHALL iniciar a transmissão de vídeo da câmera com resolução máxima de 720p a 30 FPS para todos os participantes da Sala
2. WHEN o usuário clica no botão de compartilhamento de tela, THE Servidor_de_Mídia SHALL transmitir o stream de tela com resolução Full HD a 5 FPS para todos os participantes da Sala
3. WHILE o compartilhamento de tela está ativo, THE Servidor_de_Mídia SHALL utilizar Simulcast para adaptar a qualidade do stream conforme a banda disponível de cada receptor
4. IF a conexão do cliente com o Servidor_de_Mídia falhar por mais de 5 segundos, THEN THE Servidor_de_Mídia SHALL rotear o stream via TURN_Relay
5. WHEN o usuário clica novamente no botão de vídeo ou compartilhamento de tela, THE Servidor_de_Mídia SHALL encerrar a transmissão correspondente
6. WHEN um usuário entra em uma Sala, THE Plataforma SHALL manter vídeo e compartilhamento de tela desativados até que o usuário os ative explicitamente
7. IF o navegador negar acesso à câmera ou o usuário cancelar a seleção de tela no diálogo do navegador, THEN THE Plataforma SHALL exibir uma mensagem indicando que a permissão foi negada e manter o botão correspondente no estado desativado

### Requirement 4: Zonas Privadas (Salas de Reunião)

**User Story:** Como usuário, eu quero entrar em áreas privadas no mapa para ter conversas isoladas, para que eu possa discutir assuntos confidenciais sem ser ouvido por outros.

#### Acceptance Criteria

1. WHEN um avatar entra em uma Zona_Privada, THE Servidor_de_Mídia SHALL desconectar o usuário do canal de áudio anterior (canal geral da Sala ou canal de outra Zona_Privada) e conectá-lo ao canal exclusivo da Zona_Privada de destino em no máximo 500 milissegundos
2. WHILE um usuário está dentro de uma Zona_Privada, THE Servidor_de_Mídia SHALL impedir que usuários externos à zona recebam qualquer faixa de áudio ou vídeo originada dentro da zona, e impedir que usuários internos recebam faixas de áudio do canal geral da Sala
3. WHEN um avatar sai de uma Zona_Privada para uma área comum, THE Servidor_de_Mídia SHALL desconectar o usuário do canal da zona e reconectá-lo ao canal de áudio geral da Sala em no máximo 500 milissegundos
4. IF a troca de canal de áudio falhar durante a entrada ou saída de uma Zona_Privada, THEN THE Servidor_de_Mídia SHALL manter o usuário desconectado de ambos os canais, exibir uma mensagem de erro indicando falha na conexão de áudio, e tentar reconectar automaticamente até 3 vezes com intervalo de 2 segundos
5. WHILE um usuário está dentro de uma Zona_Privada com compartilhamento de vídeo ou tela ativo, THE Servidor_de_Mídia SHALL restringir a distribuição dessas faixas apenas aos demais participantes presentes na mesma Zona_Privada

### Requirement 5: Localização e Follow Automatizado

**User Story:** Como usuário, eu quero localizar colegas no mapa e seguir seus avatares automaticamente, para que eu possa encontrar e acompanhar pessoas sem navegar manualmente.

#### Acceptance Criteria

1. WHEN o usuário busca um colega na lista de participantes, THE Plataforma SHALL exibir uma linha no Mapa_Espacial conectando o avatar do usuário ao avatar do colega buscado, atualizando a posição da linha em tempo real conforme ambos os avatares se movem, e removendo a linha quando o usuário ativa o follow, inicia uma nova busca, ou pressiona a tecla Escape
2. WHEN o usuário ativa a função "follow" em um colega, THE Motor_de_Renderização SHALL mover o avatar do usuário na direção da posição atual do avatar alvo, com a mesma velocidade de movimentação padrão do avatar, parando quando estiver a no máximo 1 tile de distância do avatar alvo
3. WHEN o usuário pressiona qualquer tecla direcional (setas ou WASD) durante o modo follow, THE Motor_de_Renderização SHALL cancelar o follow automatizado e devolver o controle manual ao usuário
4. IF o colega alvo desconectar da plataforma durante o follow, THEN THE Plataforma SHALL cancelar o follow, parar o avatar do usuário na posição atual, e exibir uma notificação indicando que o colega saiu da Sala
5. IF o avatar alvo entra em uma Zona_Privada durante o follow, THEN THE Motor_de_Renderização SHALL parar o avatar do usuário na borda da Zona_Privada, cancelar o follow, e exibir uma notificação indicando que o colega entrou em uma zona privada

### Requirement 6: Música Compartilhada na Sala

**User Story:** Como usuário, eu quero compartilhar música com os colegas na sala, para que possamos ter um ambiente sonoro agradável durante o trabalho colaborativo.

#### Acceptance Criteria

1. WHEN o usuário ativa a função de música compartilhada e fornece uma URL de áudio ou arquivo nos formatos MP3, OGG ou WAV, THE Servidor_de_Mídia SHALL transmitir o stream de áudio da música para todos os participantes da Sala, limitando a uma única transmissão de música ativa por Sala por vez
2. WHILE a música está sendo reproduzida, THE Plataforma SHALL exibir um indicador visual contendo o nome do arquivo ou URL da música em reprodução e o nome do participante que a iniciou
3. THE Plataforma SHALL permitir que qualquer participante da Sala ajuste o volume da música individualmente no seu cliente em uma escala de 0% (silenciado) a 100%, com volume padrão de 50% ao iniciar a reprodução
4. WHEN o usuário que iniciou a música a desativa, ou quando o administrador da Sala a interrompe, THE Servidor_de_Mídia SHALL encerrar a transmissão de áudio da música para todos os participantes
5. IF o usuário fornece uma URL inacessível ou um arquivo em formato não suportado, THEN THE Plataforma SHALL rejeitar a solicitação e exibir uma mensagem de erro indicando que a fonte de áudio é inválida ou o formato não é suportado
6. WHEN um novo usuário entra em uma Sala onde já existe música sendo reproduzida, THE Servidor_de_Mídia SHALL conectar automaticamente o novo participante ao stream de música em andamento com volume padrão de 50%

### Requirement 7: Sincronização de Estado em Tempo Real

**User Story:** Como usuário, eu quero que o estado do escritório virtual esteja sempre sincronizado entre todos os participantes, para que eu veja a posição real dos colegas sem atrasos significativos.

#### Acceptance Criteria

1. THE Servidor_de_Estado SHALL sincronizar o estado da Sala entre todos os clientes conectados utilizando Delta_Binário via WebSocket com taxa mínima de 20 atualizações por segundo e latência máxima de 200ms entre a ação de um cliente e a atualização nos demais clientes
2. WHEN um novo usuário se conecta, THE Servidor_de_Estado SHALL enviar o estado completo atual da Sala incluindo posições de todos os avatares e IDs numéricos (1-20) em no máximo 2 segundos após o estabelecimento da conexão WebSocket
3. WHEN um usuário desconecta intencionalmente ou a conexão WebSocket permanece inativa por mais de 5 segundos, THE Servidor_de_Estado SHALL remover o avatar do mapa e notificar todos os clientes conectados em no máximo 2 segundos após a detecção da desconexão
4. THE Servidor_de_Estado SHALL incluir no Delta_Binário apenas os dados de estado alterados desde a última atualização, transmitindo o ID numérico do avatar (1-20) junto com a posição atualizada
5. IF a conexão WebSocket de um cliente for interrompida inesperadamente, THEN THE Servidor_de_Estado SHALL permitir reconexão automática do cliente e reenviar o estado completo da Sala sem perda de contexto para o usuário reconectado

### Requirement 8: Seleção e Persistência de Avatar

**User Story:** Como usuário, eu quero escolher meu avatar entre os modelos disponíveis e manter essa escolha entre sessões, para que eu tenha uma identidade visual consistente na plataforma.

#### Acceptance Criteria

1. WHEN um usuário acessa a plataforma e não possui um ID de avatar válido (1-20) armazenado no LocalStorage, THE Plataforma SHALL apresentar uma tela de seleção com os 20 modelos de avatar disponíveis (robôs, drones, soldados espaciais, aliens pixelados) e impedir o acesso à Sala até que uma seleção seja realizada
2. WHEN o usuário seleciona um avatar na tela de seleção, THE Plataforma SHALL armazenar o ID numérico (1-20) do avatar selecionado no LocalStorage do navegador em até 1 segundo e exibir o avatar selecionado no Mapa_Espacial
3. WHEN um usuário acessa a plataforma e possui um ID de avatar válido (1-20) armazenado no LocalStorage, THE Plataforma SHALL carregar automaticamente o avatar correspondente ao ID armazenado sem exibir a tela de seleção
4. IF o valor armazenado no LocalStorage for inexistente, não numérico, ou estiver fora do intervalo 1-20, THEN THE Plataforma SHALL tratar o usuário como novo e apresentar a tela de seleção de avatar
5. WHEN o usuário aciona a opção de trocar avatar, THE Plataforma SHALL apresentar novamente a tela de seleção com os 20 modelos e atualizar o ID armazenado no LocalStorage com a nova escolha

### Requirement 9: Gerenciamento de Salas Multi-Equipe

**User Story:** Como administrador, eu quero criar salas separadas para cada equipe da organização e distribuir links de acesso, para que cada time tenha seu próprio espaço virtual.

#### Acceptance Criteria

1. THE Plataforma SHALL permitir a criação de até 50 Salas simultâneas, cada uma com link de acesso único e configuração de mapa independente
2. WHEN um administrador cria uma nova Sala, THE Plataforma SHALL gerar um link de acesso compartilhável que qualquer usuário pode usar para entrar diretamente na Sala
3. WHEN um usuário acessa o link de uma Sala, THE Plataforma SHALL desconectá-lo de qualquer Sala anterior e conectá-lo diretamente à Sala correspondente sem exibir páginas intermediárias de navegação
4. THE Plataforma SHALL isolar completamente o estado e mídia entre Salas diferentes, garantindo que participantes de uma Sala não recebam posições de avatares, faixas de áudio nem faixas de vídeo de outra Sala
5. IF um usuário acessa um link de Sala inexistente ou removida, THEN THE Plataforma SHALL exibir uma mensagem de erro indicando que a Sala não foi encontrada e impedir a conexão

### Requirement 10: Deploy Local via Docker

**User Story:** Como administrador, eu quero implantar a plataforma localmente usando Docker para testes, para que eu possa validar o funcionamento antes de disponibilizar para a organização.

#### Acceptance Criteria

1. THE Plataforma SHALL fornecer um arquivo docker-compose.yml que, ao executar um único comando `docker compose up`, inicia os containers do Servidor_de_Estado (Colyseus), Servidor_de_Mídia (LiveKit) e proxy reverso (Nginx), com todos os serviços atingindo estado saudável em no máximo 120 segundos
2. WHEN uma requisição HTTP é recebida, THE Plataforma SHALL redirecionar automaticamente para HTTPS, garantindo que todas as conexões do navegador utilizem TLS para permitir acesso a câmera e microfone
3. THE Plataforma SHALL suportar configuração de domínios customizados via Nginx Proxy Manager, permitindo que o administrador aponte um domínio próprio para cada serviço (cliente web, Servidor_de_Estado, Servidor_de_Mídia) através de variáveis de ambiente documentadas
4. THE Plataforma SHALL funcionar em um servidor com mínimo de 2 vCPUs e 4GB de RAM rodando Ubuntu 22.04 LTS, suportando pelo menos 10 usuários simultâneos em uma única Sala com áudio ativo
5. WHEN um cliente estabelece conexão WebSocket através do Nginx proxy reverso, THE Plataforma SHALL completar o upgrade HTTP-para-WebSocket e manter a conexão persistente com o Servidor_de_Estado sem timeout por inatividade inferior a 300 segundos
6. IF um container falhar ao iniciar ou encerrar inesperadamente, THEN THE Plataforma SHALL registrar o erro nos logs do Docker e reiniciar o container automaticamente até um máximo de 3 tentativas

### Requirement 11: Deploy Público para Uso Organizacional

**User Story:** Como administrador, eu quero disponibilizar a plataforma publicamente na internet para que meus subordinados acessem de qualquer lugar, para que a organização inteira possa usar o escritório virtual.

#### Acceptance Criteria

1. THE Plataforma SHALL suportar deploy em pelo menos um provedor de nuvem gratuito ou de baixo custo (Oracle Cloud Free Tier, Fly.io ou Railway) com documentação passo-a-passo cobrindo desde a criação da conta até a plataforma acessível via navegador
2. THE Plataforma SHALL funcionar com domínio público configurável e certificado SSL provisionado automaticamente via Let's Encrypt sem intervenção manual do administrador após a configuração inicial do domínio
3. THE Plataforma SHALL documentar requisitos mínimos de infraestrutura para deploy público especificando vCPUs, RAM e largura de banda para suportar pelo menos 5 salas simultâneas com até 20 participantes cada
4. WHEN o número de participantes em uma Sala atinge o limite configurado (padrão: 20, configurável entre 2 e 50), THE Plataforma SHALL exibir uma mensagem ao novo usuário indicando que a Sala está cheia e impedir a entrada, mantendo o usuário na tela de acesso
5. IF o provisionamento automático do certificado SSL falhar, THEN THE Plataforma SHALL registrar o erro em log e exibir ao administrador uma mensagem indicando a falha na obtenção do certificado e orientações para resolução

### Requirement 12: Gerenciamento do Mapa via Tiled

**User Story:** Como administrador, eu quero configurar o mapa do escritório virtual usando o Tiled Map Editor, para que eu possa personalizar o layout e as zonas do espaço de trabalho.

#### Acceptance Criteria

1. THE Plataforma SHALL carregar mapas exportados do Tiled Map Editor no formato JSON contendo obrigatoriamente as camadas Ground, Physics, Objects e Top, com tamanho máximo de arquivo de 5 MB
2. THE Motor_de_Renderização SHALL bloquear a movimentação do avatar em tiles marcados com a propriedade customizada "collide" (camada Physics) e SHALL criar uma Zona_Privada para cada grupo contíguo de tiles marcados com a propriedade "jitsiRoom" contendo o identificador da zona como valor
3. WHEN o administrador substitui o arquivo de mapa no servidor, THE Plataforma SHALL carregar o novo mapa em até 30 segundos sem necessidade de rebuild da aplicação, e os usuários já conectados SHALL receber o mapa atualizado na próxima reconexão ou refresh da página
4. IF o arquivo de mapa JSON estiver ausente, exceder 5 MB, ou não contiver todas as camadas obrigatórias (Ground, Physics, Objects, Top), THEN THE Plataforma SHALL rejeitar o carregamento, manter o último mapa válido ativo, e registrar uma mensagem de erro indicando o motivo da rejeição
