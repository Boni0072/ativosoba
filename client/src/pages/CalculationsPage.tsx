import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CalculationsPage: React.FC = () => {
  // Dados de exemplo para depreciação e amortização
  const depreciationData = [
    { month: 'Janeiro 2026', asset: 'Escavadeira 1', value: 'R$ 1.200,00' },
    { month: 'Janeiro 2026', asset: 'Computador', value: 'R$ 150,00' },
    { month: 'Fevereiro 2026', asset: 'Escavadeira 1', value: 'R$ 1.200,00' },
    { month: 'Fevereiro 2026', asset: 'Computador', value: 'R$ 150,00' },
  ];

  const amortizationData = [
    { month: 'Janeiro 2026', asset: 'Software de Gestão', value: 'R$ 500,00' },
    { month: 'Fevereiro 2026', asset: 'Software de Gestão', value: 'R$ 500,00' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Depreciação Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {depreciationData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.month}</TableCell>
                  <TableCell>{item.asset}</TableCell>
                  <TableCell>{item.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amortização Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {amortizationData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.month}</TableCell>
                  <TableCell>{item.asset}</TableCell>
                  <TableCell>{item.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CalculationsPage;
