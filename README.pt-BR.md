# OpenKartLine

> Aplicação open source para otimização 2D da trajetória e do tempo de volta no kart.

[Read in English](README.md)

O OpenKartLine pretende transformar a geometria de uma pista e as características de um kart em um plano de volta mínima explicável: traçado, velocidade-alvo, zonas de frenagem, ponto de tangência, ápice e aplicação do acelerador.

O projeto está em **planejamento / pré-alpha**. Ele nasce público para que pilotos, engenheiros, estudantes e desenvolvedores possam participar antes que decisões técnicas se tornem caras de mudar.

## A experiência pretendida

1. Importar uma imagem, KML, GPX ou CSV — ou desenhar a pista.
2. Marcar as bordas utilizáveis, escala, sentido e linha de chegada.
3. Informar os dados do kart ou calibrá-lo com telemetria.
4. Calcular a linha e o perfil de velocidade.
5. Ver onde frear, tangenciar, atingir o ápice e voltar ao acelerador.
6. Comparar a previsão com voltas reais e melhorar o modelo.

## O que o projeto deverá mostrar

- Linha ideal dentro dos limites reais da pista.
- Velocidade-alvo e tempo estimado da volta.
- Regiões de freio, transição, aceleração parcial e aceleração total.
- Pontos de tangência, ápice e saída.
- Animação 2D sincronizada com gráficos por distância.
- Comparação entre a volta simulada e a telemetria real.
- Grau de confiança e dados usados na calibração.

## Stack inicial

- React + TypeScript + Vite para a interface.
- React Konva para o editor 2D.
- FastAPI como uma API local e pequena.
- Python, NumPy, SciPy e Shapely para geometria e física.
- CasADi + IPOPT para a etapa de otimização de tempo mínimo.
- Arquivos `.okl.json` como formato principal, sem banco obrigatório.
- Processo separado para os cálculos pesados.

Tauri, C++, acados e execução distribuída ficam como opções futuras, ativadas apenas quando medições mostrarem que são necessárias. Leia a [revisão da stack](docs/STACK.md), a [arquitetura](docs/ARCHITECTURE.md) e o [roadmap](docs/ROADMAP.md).

## Princípios

- Física primeiro; aprendizado de máquina poderá calibrar, não esconder, o modelo.
- Local-first, sem conta obrigatória e sem dependência de nuvem.
- Unidades SI dentro do motor.
- Todo resultado deverá informar hipóteses, versão do modelo e situação do solver.
- Modelos simples serão validados antes da introdução de modelos complexos.
- As recomendações são estimativas de planejamento, não garantia de segurança.

## Situação atual

Ainda não existe um simulador executável. O primeiro marco entrega o formato de dados e a geometria de uma pista circular sintética; depois virão o editor, o perfil de velocidade e a otimização conjunta.

## Como colaborar

Leia [CONTRIBUTING.md](CONTRIBUTING.md), escolha uma atividade no [Roadmap](docs/ROADMAP.md) e participe por uma issue. Discussões em português ou inglês são bem-vindas. A documentação técnica canônica será mantida em inglês para facilitar colaboração internacional.

## Segurança

Pista, pneus, temperatura, aderência e estado do kart alteram profundamente o resultado. Valide qualquer recomendação gradualmente, em ambiente controlado, obedecendo às regras do kartódromo e mantendo margem compatível com sua experiência.

## Licença

Apache 2.0. Consulte [LICENSE](LICENSE) e [THIRD_PARTY.md](THIRD_PARTY.md).
