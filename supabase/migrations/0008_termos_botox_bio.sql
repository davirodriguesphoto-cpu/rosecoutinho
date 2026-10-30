-- Termos de consentimento (toxina botulínica e bioestimulador), assinados pelo link como o contrato.
-- O texto vem dos PDFs da Rose; a autorização de imagem é perguntada na própria página de assinatura, por isso não está aqui.
insert into public.modelos_documento (tipo, titulo, texto)
select 'termo', 'Termo de consentimento — Toxina botulínica', $t$TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO - TOXINA BOTULÍNICA

Eu, {{nome}}, portador(a) do Documento de Identidade (RG) nº {{rg}} e CPF nº {{cpf}}, declaro estar ciente e devidamente orientado(a) por Roselaine Rodrigues Coutinho Lima sobre a ação da Toxina Botulínica, que é um fármaco (medicamento) com efeito de relaxamento muscular.

Trata-se de um procedimento estético minimamente invasivo, podendo ser realizado com finalidade estética. O tratamento consiste em uma (1) sessão e, caso haja necessidade de aplicação complementar, esta será realizada após 14 (quatorze) dias corridos.

Os resultados podem ser percebidos entre 2 (dois) e 15 (quinze) dias, com duração estimada de 60 (sessenta) a 180 (cento e oitenta) dias. Esse período pode variar de acordo com o organismo de cada pessoa, sendo que fatores como tabagismo, consumo de álcool, má alimentação, entre outros, podem interferir no resultado final.

A aplicação da toxina botulínica é contraindicada em pacientes com hipersensibilidade à substância ou a qualquer componente da fórmula, em portadores de doenças neuromusculares como Miastenia Gravis, Síndrome de Lambert-Eaton, Esclerose Lateral Amiotrófica (ELA) e Doença de Charcot-Marie-Tooth, bem como em casos de infecção ou inflamação no local da aplicação, gestantes, lactantes e pacientes em tratamento oncológico ativo. Também requerem avaliação individual pacientes com doenças autoimunes ativas, distúrbios de coagulação, uso de anticoagulantes, uso recente de antibióticos aminoglicosídeos ou relaxantes musculares, e pessoas que apresentem estado febril ou infecção sistêmica.

Reações e riscos que podem ser observados após o tratamento:
• Reação alérgica;
• Edemas e ematomas;
• Assimetria Facial;
• Dor de cabeça.

Declaro minha concordância em me submeter à aplicação da toxina botulínica, assumindo a responsabilidade e os riscos por eventuais efeitos indesejáveis, e autorizo a realização do procedimento.

Estou ciente de que o meu atendimento será realizado pela profissional esteta Roselaine Rodrigues Coutinho Lima.

Declaro ter recebido todas as orientações necessárias sobre os cuidados pós-procedimento, bem como sobre a possibilidade de novas sessões e o uso de medicação prescrita para o controle de eventuais desconfortos após a aplicação.

Assinado em {{data_hora}}.$t$
where not exists (select 1 from public.modelos_documento where titulo = 'Termo de consentimento — Toxina botulínica');

insert into public.modelos_documento (tipo, titulo, texto)
select 'termo', 'Termo de consentimento — Bioestimulador de colágeno', $t$TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO - BIOESTIMULADOR DE COLÁGENO

Eu, {{nome}}, portador(a) do Documento de Identidade (RG) nº {{rg}} e CPF nº {{cpf}}, estou ciente e bem orientado(a) pela Roselaine Rodrigues Coutinho Lima sobre a ação dos bioestimuladores de colágeno realizado com hidroxiapatita de cálcio, que é um componente biocompatível, reabsorvível e possui ação que induz produção de colágeno e restauração de volume. É um procedimento estético minimamente invasivo e suas aplicações podem ser realizadas tanto facial como corporal, sendo um tratamento eficaz contra a flacidez. O tratamento consiste em 1 (uma) ou mais sessões com intervalo de 30 dias, que será avaliado pelo profissional ao decorrer do tratamento. Os resultados podem ser sentidos entre 30 a 90 dias após a aplicação e sua ação pode durar por cerca de 12 a 18 meses no organismo, esse tempo pode variar de organismo para organismo, fatores como: fumo, álcool, má alimentação e outros; podem interferir no resultado final.

É contraindicado em pacientes com sensibilidade à hidroxiapatita de cálcio, ou seus componentes, gestantes, lactantes, susceptibilidade a queloides, doença autoimune não controlada e problemas de coagulação ou uso de coagulantes.

Reações e riscos que podem ser observados após o tratamento:
• Reação alérgica
• Formação de nódulos
• Possibilidade de reação inflamatória
• Não permite extração
• Assimetria facial
• Edema / equimose / hematoma

Declaro minha concordância em me submeter à aplicação do BIOESTIMULADOR DE COLÁGENO, assumindo a responsabilidade e os riscos pelos eventuais efeitos indesejáveis, e autorizo a realização do procedimento.

Estou ciente de que meu atendimento será realizado pela profissional esteta Roselaine Rodrigues Coutinho Lima.

Declaro ter recebido todas as orientações necessárias sobre os cuidados que devo ter após a aplicação do BIOESTIMULADOR DE COLÁGENO, bem como a necessidade de mais sessões e uma receita para controle de eventuais dores pós-aplicação.

Descrição do material utilizado e número de sessões:
{{objeto}}

Assinado em {{data_hora}}.$t$
where not exists (select 1 from public.modelos_documento where titulo = 'Termo de consentimento — Bioestimulador de colágeno');
