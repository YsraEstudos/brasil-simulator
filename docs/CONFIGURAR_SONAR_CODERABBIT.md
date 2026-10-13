# Configurar SonarCloud e CodeRabbit no GitHub

Este repositório já contém as configurações para executar `npm run check` e a análise do SonarCloud em pull requests, além de solicitar revisões automáticas do CodeRabbit. Para ativar os serviços, complete os passos abaixo em `YsraEstudos/brasil-simulator`.

## 1. Configurar SonarCloud EU

1. Acesse [SonarQube Cloud](https://sonarcloud.io) com sua conta GitHub.
2. Importe o repositório `YsraEstudos/brasil-simulator` e crie o projeto correspondente.
3. No projeto, escolha análise baseada em CI/GitHub Actions. Se a análise automática estiver ligada, desative-a em **Administration → Analysis Method** para não duplicar o workflow.
4. Anote a chave da organização e a chave do projeto mostradas pelo SonarCloud.
5. Crie um token de análise com acesso somente a esse projeto, se essa opção estiver disponível.
6. No GitHub, abra **Settings → Secrets and variables → Actions** e cadastre:

   | Tipo | Nome | Valor |
   | --- | --- | --- |
   | Secret | `SONAR_TOKEN` | Token de análise criado no SonarCloud |
   | Variable | `SONAR_ORGANIZATION` | Chave da organização no SonarCloud |
   | Variable | `SONAR_PROJECT_KEY` | Chave do projeto no SonarCloud |

   Nunca grave o token nos arquivos do repositório nem o envie em mensagens.

O workflow interrompe o check se qualquer um desses três valores estiver ausente. Com eles cadastrados, uma análise que falhar no Quality Gate também reprova o job `check`.

## 2. Ativar CodeRabbit

O status `CodeRabbit` já apareceu como sucesso no PR desta configuração, confirmando que o app está integrado ao repositório. O arquivo `.coderabbit.yaml` solicita revisões automáticas em português, inclusive em PRs em rascunho, e reavalia novos commits.

Se o status deixar de aparecer em PRs futuros, entre ou crie uma conta em [CodeRabbit](https://app.coderabbit.ai) com GitHub, adicione `YsraEstudos/brasil-simulator` à lista de repositórios e autorize o app.

## 3. Exigir os checks antes do merge (opcional)

Para que um PR não possa ser integrado antes das verificações:

1. No GitHub, abra **Settings → Rules → Rulesets** (ou a regra de proteção da branch `main`).
2. Ative **Require status checks to pass before merging**.
3. Selecione `check` para exigir lint, typecheck, testes e Quality Gate do SonarCloud.
4. Depois que o CodeRabbit concluir sua primeira revisão, volte à regra e selecione também o status do CodeRabbit, caso ele apareça como verificação disponível.

O workflow não recebe `SONAR_TOKEN` em eventos de pull request originados de forks. Para esses PRs, o job de análise falha na validação de configuração; não use `pull_request_target` para contornar isso executando código externo com acesso ao token.

## 4. Confirmar a instalação

Depois de salvar as variáveis, abra um PR de teste ou atualize um PR aberto. Em **Actions**, confirme que o job `check` termina verde e que o SonarCloud publica o resultado. No PR, confirme que o CodeRabbit iniciou uma revisão. Se o job falhar por configuração ausente, confira os nomes exatos dos secrets e das variáveis na etapa 1.

Na primeira execução deste workflow, `npm run check` passou e a validação Sonar falhou porque os três valores ainda não estavam cadastrados. Depois de concluir a etapa 1, reexecute o job para confirmar a análise.
