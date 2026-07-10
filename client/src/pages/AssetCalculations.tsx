import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AssetCalculationsProps {
  asset: any;
}

const AssetCalculations: React.FC<AssetCalculationsProps> = ({ asset }) => {
  // Mock data for demonstration
  const depreciationData = [
    { month: 'Janeiro 2026', value: 'R$ 1.200,00' },
    { month: 'Fevereiro 2026', value: 'R$ 1.200,00' },
    { month: 'Março 2026', value: 'R$ 1.200,00' },
  ];

  const amortizationData = [
    { month: 'Janeiro 2026', value: 'R$ 500,00' },
    { month: 'Fevereiro 2026', value: 'R$ 500,00' },
  ];

  return (
    <Tabs defaultValue="depreciation" className="w-full mt-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="depreciation">Depreciação</TabsTrigger>
        <TabsTrigger value="amortization">Amortização</TabsTrigger>
      </TabsList>
      <TabsContent value="depreciation">
        <Card>
          <CardHeader>
            <CardTitle>Depreciação Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depreciationData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.month}</TableCell>
                    <TableCell>{item.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="amortization">
        <Card>
          <CardHeader>
            <CardTitle>Amortização Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {amortizationData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.month}</TableCell>
                    <TableCell>{item.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default AssetCalculations;
