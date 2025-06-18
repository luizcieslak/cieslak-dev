---
title: Como usar seu celular para programar
excerpt: Um setup emergencial para que você possa usar seu celular para programar em momentos em que seu computador não está disponível.
publishDate: '2025-xx-xx'
updatedDate: '2025-xx-xx'
seo:
  image:
    src: '/wip'
    alt: wip'.
---

![wip](/wip)

Recentemente estava viajando e meu computador pifou. A placa-mãe dele queimou. Eu estava numa cidade bem remota (Morro de São Paulo, inclusive recomendo muito a visita) e portanto, sem um lugar para arrumá-lo. Comecei entrar em desespero pois tinha demandas para entregar precisava codar de alguma forma.

Foi então que entrei num universo de desenvolvimento usando o celular o que me salvou. Compartilho aqui como eu fiz para caso o futuro eu precise ou você também.

O tutorial abaixo é feito para a programação utilizando as seguintes ferramentas:

- Terminal
- node/npm
- VSCode
- docker

# Celular

Obviamente, o primeiro passo é ter um celular. Eu procurei algumas soluções para iOS como [LibTerm](https://github.com/ColdGrub1384/LibTerm) e [a-shell](https://github.com/holzschu/a-shell) mas aparentemente nenhuma consegue rodar todos os pré-requisitos.

Portanto, o tutorial abaixo vai falar **somente dispositivos Androids**, já que esses possuem maior flexibilidade ao rodar binários e o acesso ao terminal através deles é feito de maneira nativa. Importante ressaltar que o **root** não é necessario (apesar de que tudo fica mais fácil com o celular rootado).

# Terminal

Aqui não tem outra opção a não ser o [Termux](https://termux.com/). É o app mais utilizado para acessar o terminal, possue uma comunidade grande de devs e com vários projetos open source.

O Termux vem com [packet manager](https://wiki.termux.com/wiki/Package_Management) que têm uma experiencia muito parecida com o Linux desktop, o que faz com que a instalação das ferramentas seja tão simples quanto:

```bash
python nodejs yarn git
```

Existem algumas limitações, como por exemplo, não poder instalar uma versão especifica do `node`. Mais um motivo para manter a versão do node da sua aplicação atualizada no LTS!. (add link p gh issue)

# Node

# VSCode

Para instalar o VSCode, basta acessar o Play Store e procurar por "VSCode".

# Docker
