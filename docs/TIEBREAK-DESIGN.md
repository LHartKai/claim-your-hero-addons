# Desempate por personagem

## Objetivo

Impedir que um claim seja concluído quando outro jogador tiver um interesse prioritário no mesmo personagem e encaminhar a decisão aos GMs/Assistants GM conectados.

## Gatilhos

Ao tentar confirmar o claim, verificar os demais jogadores ativos para o personagem solicitado:

1. **Favorito**: qualquer reação `favorite` no personagem gera disputa.
2. **Único Interessado**: uma reação `interested` gera disputa somente quando esse jogador não possui nenhum outro personagem marcado como `interested` ou `favorite`. A reação no personagem disputado é desconsiderada ao procurar outros personagens.
3. **Ficha aberta**: gera disputa quando outro jogador está com a ficha desse personagem aberta, mesmo sem reação.

A reação `not-wanted` não gera disputa.

## Fluxo esperado

- A validação acontece antes de executar o claim original; enquanto houver disputa, nenhuma permissão Owner ou vínculo de personagem é alterado.
- Cada personagem tem uma disputa independente, identificada pelo Actor ID e por um ID próprio da solicitação.
- Todos os GMs/Assistants GM conectados recebem a disputa. A interface de GM mantém uma aba por personagem, sem substituir disputas de outros personagens.
- A aba lista o solicitante e todos os jogadores que atendem a algum gatilho, identificando o motivo de cada um.
- Cada jogador listado tem uma ação **Permitir claim**. A autorização é específica para o solicitante escolhido e para aquele personagem; depois dela, o fluxo original de claim é retomado e validado novamente pelo GM ativo.
- O solicitante vê um aviso de disputa em andamento, com o personagem e os ícones dos demais jogadores interessados.
- Ao concluir, cancelar, desconectar um participante ou o personagem ser reivindicado por outra via, a disputa correspondente é encerrada sem afetar as demais.

## Autoridade e sincronização

- A decisão final e a execução do claim continuam sob autoridade do GM ativo, aproveitando a validação existente do Claim Your Hero.
- Mensagens de disputa são transitórias e sincronizadas pelo socket do Foundry; não são gravadas como flags permanentes.
- A autorização deve ser de uso único, expirar se não for consumida e ser revalidada contra o estado atual do Actor e do jogador antes do claim.
- O estado de ficha aberta precisa ser anunciado pelos clientes dos jogadores e removido ao fechar a ficha ou desconectar.

## Critérios de aceite

- Favorito de outro jogador sempre abre disputa.
- Interessado de outro jogador abre disputa somente quando for o único personagem desse jogador marcado como Interessado/Favorito.
- Ficha aberta por outro jogador abre disputa mesmo sem reação.
- Interessado acompanhado por outra reação Interessado/Favorito do mesmo jogador não abre disputa por si só.
- Não quero nunca abre disputa por si só.
- O claim não altera permissões nem personagem enquanto aguarda.
- Autorizar um jogador permite somente o claim daquele jogador; os demais não recebem autorização.
- Disputas simultâneas para personagens diferentes permanecem independentes.
- O encerramento de uma disputa não fecha nem sobrescreve as outras.
- GMs e Assistants GM conectados veem o mesmo estado e não conseguem conceder duas autorizações conflitantes.
